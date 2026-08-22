import { useCallback, useEffect, useRef, useState } from 'react'
import { derive, formatDuration, HOUR_MS } from '../core/clock'
import { formatClockTime, fromDatetimeLocalValue, toDatetimeLocalValue } from '../core/time'
import {
  endFast,
  getLastSeenNow,
  hasClockRolledBack,
  loadActive,
  loadSettings,
  recordLastSeenNow,
  saveActive,
  startFast,
  subscribe,
} from '../core/storage'
import type { ActiveFast, Phase, Settings } from '../core/types'
import { Ring } from './Ring'
import type { RingHandle } from './Ring'

const MAX_GOAL_HOURS = 48
const DOCTOR_NOTE_THRESHOLD_HOURS = 24
const START_TIME_WINDOW_MS = 48 * HOUR_MS
const UNDO_WINDOW_MS = 5000

function pluralHours(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`
}

function clampStartedAt(ms: number, now: number): number {
  return Math.min(now, Math.max(now - START_TIME_WINDOW_MS, ms))
}

function clampGoalHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 1
  return Math.min(MAX_GOAL_HOURS, hours)
}

interface ReadoutState {
  display: string
  phase: Phase
  absurd: boolean
  clockRolledBack: boolean
  suggestedStart: number
}

export function Timer() {
  const [active, setActive] = useState<ActiveFast | null>(() => loadActive())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const ringRef = useRef<RingHandle>(null)
  const [readout, setReadout] = useState<ReadoutState | null>(null)

  useEffect(
    () =>
      subscribe(() => {
        setActive(loadActive())
        setSettings(loadSettings())
      }),
    [],
  )

  useEffect(() => {
    if (!active) {
      setReadout(null)
      return
    }

    let rafId = 0
    let intervalId = 0

    const buildDerived = (now: number) =>
      derive({
        startedAt: active.startedAt,
        goalHours: active.goalHours,
        firedMilestones: active.firedMilestones,
        milestonePercents: settings.milestonePercents,
        now,
      })

    const frame = () => {
      if (document.hidden) return
      const d = buildDerived(Date.now())
      ringRef.current?.writeFrame({ progress: d.progress, lapProgress: d.lapProgress, intensity: d.intensity })
      if (d.absurd) return // freeze: no further frames scheduled (spec §10 absurd duration)
      rafId = requestAnimationFrame(frame)
    }

    const tickText = () => {
      const now = Date.now()
      const previousLastSeenNow = getLastSeenNow()
      const rolledBack = hasClockRolledBack(now)
      recordLastSeenNow(now)

      const d = buildDerived(now)
      const elapsedAtLastSeen =
        previousLastSeenNow !== null ? Math.max(0, previousLastSeenNow - active.startedAt) : d.elapsedMs
      const suggestedStart = now - elapsedAtLastSeen

      ringRef.current?.writeReadout({
        ariaValueNow: Math.round(d.progress * 100),
        ariaValueText: `${formatDuration(d.elapsedMs)} of a ${pluralHours(active.goalHours)} goal`,
        progressPercent: d.progress * 100,
        lapIndex: d.lapIndex,
      })
      setReadout({
        display: formatDuration(d.elapsedMs),
        phase: d.phase,
        absurd: d.absurd,
        clockRolledBack: rolledBack,
        suggestedStart,
      })

      if (d.absurd) clearInterval(intervalId)
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        tickText()
        frame()
      }
    }

    frame()
    tickText()
    intervalId = window.setInterval(tickText, 1000)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [active, settings.milestonePercents])

  const handleEndFast = useCallback(() => {
    endFast(Date.now())
  }, [])

  const handleCorrectStart = useCallback(
    (newStartedAt: number) => {
      if (!active) return
      saveActive({ ...active, startedAt: clampStartedAt(newStartedAt, Date.now()) })
    },
    [active],
  )

  const [undoVisible, setUndoVisible] = useState(false)
  const undoTimeoutRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(undoTimeoutRef.current), [])

  // Owned here, not by IdleStart: starting a fast flips `active` to
  // non-null immediately (via the storage subscription above), which
  // would unmount IdleStart before its own 5s toast ever got to render.
  const handleIdleStart = useCallback((startedAt: number, goalHours: number) => {
    startFast(startedAt, goalHours)
    setUndoVisible(true)
    window.clearTimeout(undoTimeoutRef.current)
    undoTimeoutRef.current = window.setTimeout(() => setUndoVisible(false), UNDO_WINDOW_MS)
  }, [])

  const handleUndo = useCallback(() => {
    window.clearTimeout(undoTimeoutRef.current)
    setUndoVisible(false)
    saveActive(null) // removes the fast entirely: no history entry (spec §10 accidental start)
  }, [])

  return (
    <>
      {active ? (
        <main className="shell" data-phase={readout?.phase ?? 'fasting'}>
          <p className="eyebrow">fasting since {formatClockTime(active.startedAt)}</p>

          {readout?.clockRolledBack && (
            <div className="banner" role="status">
              <p>Your device clock moved backwards. The elapsed time above may be wrong.</p>
              <EditStartTime value={readout.suggestedStart} now={Date.now()} onSave={handleCorrectStart} />
            </div>
          )}

          <div className="timer-ring-wrap">
            <Ring ref={ringRef} milestonePercents={settings.milestonePercents} />
            <div className="readout">
              <div className="readout-time">{readout?.display ?? '—'}</div>
              <div className="readout-goal">goal {pluralHours(active.goalHours)}</div>
            </div>
          </div>

          {readout?.absurd && (
            <div className="banner" role="alert">
              <p>This fast has run for over 168 hours. That&rsquo;s almost certainly a forgotten timer.</p>
              <EditStartTime value={Date.now()} now={Date.now()} onSave={handleCorrectStart} />
            </div>
          )}

          <button type="button" className="btn btn-end" onClick={handleEndFast}>
            End fast
          </button>
        </main>
      ) : (
        <IdleStart defaultGoalHours={settings.defaultGoalHours} onStart={handleIdleStart} />
      )}

      {undoVisible && (
        <div className="toast" role="status">
          <span>Fast started.</span>
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
    </>
  )
}

interface IdleStartProps {
  defaultGoalHours: number
  onStart: (startedAt: number, goalHours: number) => void
}

function IdleStart({ defaultGoalHours, onStart }: IdleStartProps) {
  const [goalHours, setGoalHours] = useState(defaultGoalHours)
  // null = untouched: resolves to "now" at submit time. A string here would
  // round-trip through datetime-local's minute precision and silently
  // backdate every fast that doesn't touch this field.
  const [startedAtOverride, setStartedAtOverride] = useState<string | null>(null)

  const now = Date.now()
  const minStart = toDatetimeLocalValue(now - START_TIME_WINDOW_MS)
  const maxStart = toDatetimeLocalValue(now)
  const startedAtValue = startedAtOverride ?? maxStart

  const handleStart = () => {
    const requestedNow = Date.now()
    const startedAt =
      startedAtOverride !== null
        ? clampStartedAt(fromDatetimeLocalValue(startedAtOverride), requestedNow)
        : requestedNow
    onStart(startedAt, clampGoalHours(goalHours))
  }

  return (
    <main className="shell" data-phase="idle">
      <p className="eyebrow">lapso</p>

      <div className="idle-form">
        <label className="field">
          <span>Goal</span>
          <input
            type="number"
            min={1}
            max={MAX_GOAL_HOURS}
            step={0.5}
            value={goalHours}
            onChange={(e) => setGoalHours(clampGoalHours(Number(e.target.value)))}
          />
          <span className="field-unit">hours</span>
        </label>
        {goalHours > DOCTOR_NOTE_THRESHOLD_HOURS && (
          <p className="note">Consider discussing extended fasting with a doctor.</p>
        )}

        <label className="field">
          <span>Started</span>
          <input
            type="datetime-local"
            value={startedAtValue}
            min={minStart}
            max={maxStart}
            onChange={(e) => setStartedAtOverride(e.target.value)}
          />
        </label>

        <button type="button" className="btn btn-primary" onClick={handleStart}>
          Start fast
        </button>
      </div>
    </main>
  )
}

interface EditStartTimeProps {
  value: number
  now: number
  onSave: (ms: number) => void
}

function EditStartTime({ value, now, onSave }: EditStartTimeProps) {
  const [draft, setDraft] = useState(() => toDatetimeLocalValue(value))
  const min = toDatetimeLocalValue(now - START_TIME_WINDOW_MS)
  const max = toDatetimeLocalValue(now)

  return (
    <div className="edit-start">
      <label className="field">
        <span>Correct start time</span>
        <input type="datetime-local" value={draft} min={min} max={max} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button type="button" onClick={() => onSave(fromDatetimeLocalValue(draft))}>
        Save
      </button>
    </div>
  )
}
