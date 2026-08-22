import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  derive,
  formatDuration,
  formatElapsedClock,
  formatShortDuration,
  hourGoalLabel,
  HOUR_MS,
  pluralHours,
} from '../core/clock'
import { resolveTheme, snapProgressStep, surfaceColor } from '../core/color'
import { catchUpCopy, headlineMilestone, milestoneCopy } from '../core/milestones'
import { showMilestoneNotification } from '../core/notify'
import { formatClockTime, fromDatetimeLocalValue, toDatetimeLocalValue } from '../core/time'
import {
  endFast,
  getLastSeenNow,
  hasClockRolledBack,
  loadActive,
  loadHistory,
  loadSettings,
  recordLastSeenNow,
  saveActive,
  startFast,
  subscribe,
} from '../core/storage'
import type { ActiveFast, CompletedFast, Phase, Settings } from '../core/types'
import { Ring } from './Ring'
import type { RingHandle } from './Ring'

const MAX_GOAL_HOURS = 48
const DOCTOR_NOTE_THRESHOLD_HOURS = 24
const START_TIME_WINDOW_MS = 48 * HOUR_MS
const UNDO_WINDOW_MS = 5000
const MILESTONE_TOAST_MS = 6000
const NOTIFICATION_TITLE = 'Lapso'

function clampStartedAt(ms: number, now: number): number {
  return Math.min(now, Math.max(now - START_TIME_WINDOW_MS, ms))
}

function clampGoalHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 1
  return Math.min(MAX_GOAL_HOURS, hours)
}

function useMediaQueryMatches(query: string): boolean {
  const mql = useMemo(
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null),
    [query],
  )
  const [matches, setMatches] = useState(() => mql?.matches ?? false)

  useEffect(() => {
    if (!mql) return
    const handleChange = () => setMatches(mql.matches)
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [mql])

  return matches
}

interface ReadoutState {
  display: string
  phase: Phase
  absurd: boolean
  clockRolledBack: boolean
  suggestedStart: number
}

interface MilestoneNotice {
  key: string
  copy: string
}

export function Timer() {
  const [active, setActive] = useState<ActiveFast | null>(() => loadActive())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [history, setHistory] = useState<CompletedFast[]>(() => loadHistory())
  const ringRef = useRef<RingHandle>(null)
  const [readout, setReadout] = useState<ReadoutState | null>(null)
  const [milestoneToast, setMilestoneToast] = useState<MilestoneNotice | null>(null)
  const [catchUpCard, setCatchUpCard] = useState<MilestoneNotice | null>(null)
  const milestoneToastTimeoutRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(milestoneToastTimeoutRef.current), [])

  const prefersDark = useMediaQueryMatches('(prefers-color-scheme: dark)')
  const prefersReducedMotion = useMediaQueryMatches('(prefers-reduced-motion: reduce)')
  const theme = resolveTheme(settings.theme, prefersDark)
  const reduceMotion = settings.reduceMotion === 'always' || prefersReducedMotion

  useEffect(
    () =>
      subscribe(() => {
        setActive(loadActive())
        setSettings(loadSettings())
        setHistory(loadHistory())
      }),
    [],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    if (!active) {
      setReadout(null)
      setCatchUpCard(null)
      document.body.style.backgroundColor = ''
      document.documentElement.style.setProperty('--p', '0')
      return
    }

    let rafId = 0
    let intervalId = 0
    let previousPhase: Phase | null = null
    // Authoritative for this effect's lifetime: firing persists via
    // saveActive(), but that write reaches `active` only after storage's
    // subscribe callback round-trips through React. Without this local
    // copy, frames in that window would keep re-deriving the same
    // already-fired key against the stale closure and fire it again.
    const sessionFired = new Set(active.firedMilestones)

    const buildDerived = (now: number) =>
      derive({
        startedAt: active.startedAt,
        goalHours: active.goalHours,
        firedMilestones: [...sessionFired],
        milestonePercents: settings.milestonePercents,
        now,
      })

    // spec §6.3: on every launch (or any jump that surfaces more than the
    // usual single next milestone), one consolidated retrospective card,
    // not a burst of live notifications for each one.
    const initialDue = buildDerived(Date.now()).dueMilestones
    if (initialDue.length > 0) {
      for (const key of initialDue) sessionFired.add(key)
      saveActive({ ...active, firedMilestones: [...sessionFired] })
      const headline = headlineMilestone(initialDue)
      if (headline) {
        const d = buildDerived(Date.now())
        setCatchUpCard({
          key: headline,
          copy: catchUpCopy({ key: headline, goalHours: active.goalHours, goalMs: d.goalMs, elapsedMs: d.elapsedMs }),
        })
      }
    }

    const frame = () => {
      if (document.hidden) return
      const d = buildDerived(Date.now())

      document.body.style.backgroundColor = surfaceColor(d.progress, theme)
      document.documentElement.style.setProperty('--p', String(reduceMotion ? snapProgressStep(d.progress) : d.progress))
      // Under reduced motion the ring's position/color still update (spec
      // §5.6: "that is information, not decoration"); only the ambient
      // glow's continuous fade is suppressed, along with the swell below.
      ringRef.current?.writeFrame({
        progress: d.progress,
        lapProgress: d.lapProgress,
        intensity: reduceMotion ? 0 : d.intensity,
      })

      if (previousPhase === 'fasting' && d.phase === 'overtime' && !reduceMotion) {
        ringRef.current?.triggerGoalSwell()
        document.body.classList.add('swelling')
        window.setTimeout(() => document.body.classList.remove('swelling'), 900)
        navigator.vibrate?.([40, 60, 40])
      }
      previousPhase = d.phase

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

      // Live path (spec §6.1): each newly-due key here was NOT already
      // swept up by the catch-up check above, so it just crossed for real
      // while this session was actively watching -- fire it properly.
      if (d.dueMilestones.length > 0) {
        for (const key of d.dueMilestones) sessionFired.add(key)
        saveActive({ ...active, firedMilestones: [...sessionFired] })
        for (const key of d.dueMilestones) {
          const copy = milestoneCopy({ key, goalHours: active.goalHours, goalMs: d.goalMs, elapsedMs: d.elapsedMs })
          void showMilestoneNotification(NOTIFICATION_TITLE, copy)
        }
        const headline = headlineMilestone(d.dueMilestones)
        if (headline) {
          setMilestoneToast({
            key: headline,
            copy: milestoneCopy({ key: headline, goalHours: active.goalHours, goalMs: d.goalMs, elapsedMs: d.elapsedMs }),
          })
          window.clearTimeout(milestoneToastTimeoutRef.current)
          milestoneToastTimeoutRef.current = window.setTimeout(() => setMilestoneToast(null), MILESTONE_TOAST_MS)
        }
      }

      ringRef.current?.writeReadout({
        ariaValueNow: Math.round(d.progress * 100),
        ariaValueText: `${formatDuration(d.elapsedMs)} of a ${hourGoalLabel(active.goalHours)}`,
        progressPercent: d.progress * 100,
        lapIndex: d.lapIndex,
      })
      setReadout({
        display: formatElapsedClock(d.elapsedMs),
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
      document.body.style.backgroundColor = ''
      document.body.classList.remove('swelling')
    }
  }, [active, settings.milestonePercents, theme, reduceMotion])

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
          <div className="eyebrow-row">
            <p className="eyebrow">fasting since {formatClockTime(active.startedAt)}</p>
            <a className="eyebrow-link" href="#/settings">
              settings
            </a>
          </div>

          {catchUpCard && (
            <div className="banner" role="status">
              <p>{catchUpCard.copy}</p>
              <button type="button" onClick={() => setCatchUpCard(null)}>
                Dismiss
              </button>
            </div>
          )}

          {readout?.clockRolledBack && (
            <div className="banner" role="status">
              <p>Your device clock moved backwards. The elapsed time above may be wrong.</p>
              <EditStartTime value={readout.suggestedStart} now={Date.now()} onSave={handleCorrectStart} />
            </div>
          )}

          <div className="timer-ring-wrap">
            <Ring ref={ringRef} milestonePercents={settings.milestonePercents} />
            <div className="readout">
              <div className="readout-time">
                <TabularTime value={readout?.display ?? '00:00:00'} />
              </div>
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

          <RecentFasts history={history} />
        </main>
      ) : (
        <IdleStart defaultGoalHours={settings.defaultGoalHours} onStart={handleIdleStart} history={history} />
      )}

      {undoVisible && (
        <div className="toast" role="status">
          <span>Fast started.</span>
          <button type="button" onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}

      {!undoVisible && milestoneToast && (
        <div className="toast" role="status">
          <span>{milestoneToast.copy}</span>
        </div>
      )}
    </>
  )
}

interface IdleStartProps {
  defaultGoalHours: number
  onStart: (startedAt: number, goalHours: number) => void
  history: CompletedFast[]
}

function IdleStart({ defaultGoalHours, onStart, history }: IdleStartProps) {
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
      <div className="eyebrow-row">
        <p className="eyebrow">lapso</p>
        <a className="eyebrow-link" href="#/settings">
          settings
        </a>
      </div>

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

      <RecentFasts history={history} />
    </main>
  )
}

// Last 4 durations, neutral and tappable through to History (spec §5.4
// layout: "recent 16h02 15h48 16h30 17h11"). Oldest-to-newest, matching
// the same left-to-right convention as Chart.
function RecentFasts({ history }: { history: CompletedFast[] }) {
  const recent = history.slice(-4)
  if (recent.length === 0) return null

  return (
    <a className="recent-fasts" href="#/history">
      <span className="recent-fasts-label">recent</span>
      {recent.map((fast) => (
        <span key={fast.id} className="mono">
          {formatShortDuration(fast.endedAt - fast.startedAt)}
        </span>
      ))}
    </a>
  )
}

const DIGIT = /[0-9]/

// Wraps each digit in a fixed-width span (spec §5.3) so the layout never
// jitters per second, regardless of whether the loaded Fraunces cut
// actually exposes the tnum OpenType feature.
function TabularTime({ value }: { value: string }) {
  return (
    <>
      {[...value].map((char, i) => (
        <span key={i} className={DIGIT.test(char) ? 'tnum-digit' : undefined}>
          {char}
        </span>
      ))}
    </>
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
