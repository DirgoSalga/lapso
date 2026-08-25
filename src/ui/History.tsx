import { useEffect, useState } from 'react'
import { formatDuration, hourGoalLabel, HOUR_MS } from '../core/clock'
import { ringColor } from '../core/color'
import { formatDateTime } from '../core/time'
import { loadHistory, loadSettings, subscribe } from '../core/storage'
import type { CompletedFast } from '../core/types'
import { Chart } from './Chart'
import { useSelectedHistoryId } from './router'

export function History() {
  const [history, setHistory] = useState<CompletedFast[]>(() => loadHistory())
  const [defaultGoalHours, setDefaultGoalHours] = useState(() => loadSettings().defaultGoalHours)
  const selectedId = useSelectedHistoryId()

  useEffect(
    () =>
      subscribe(() => {
        setHistory(loadHistory())
        setDefaultGoalHours(loadSettings().defaultGoalHours)
      }),
    [],
  )

  const reverseChronological = [...history].reverse() // history is newest-last
  const selectedFast = selectedId ? history.find((fast) => fast.id === selectedId) : undefined

  // A selected id that no longer resolves to a fast (e.g. a stale/bad link)
  // falls back to the list rather than showing a dead end.
  if (selectedId && selectedFast) {
    return <FastCard fast={selectedFast} />
  }

  return (
    <main className="shell shell-wide">
      <div className="eyebrow-row">
        <a className="eyebrow-link" href="#/">
          &larr; back
        </a>
        <p className="eyebrow">history</p>
      </div>

      {history.length === 0 ? (
        <p className="empty-state">No fasts recorded yet.</p>
      ) : (
        <>
          <Chart history={history} goalHours={defaultGoalHours} />
          <ul className="history-list">
            {reverseChronological.map((fast) => (
              <HistoryRow key={fast.id} fast={fast} />
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

function HistoryRow({ fast }: { fast: CompletedFast }) {
  const [expanded, setExpanded] = useState(false)
  const durationMs = fast.endedAt - fast.startedAt

  return (
    <li className="history-row">
      <button type="button" className="history-row-summary" onClick={() => setExpanded((v) => !v)}>
        <span className="mono">{formatDateTime(fast.startedAt)}</span>
        <span>{formatDuration(durationMs)}</span>
        <span className="history-row-goal">{hourGoalLabel(fast.goalHours)}</span>
      </button>
      <a className="history-row-card-link" href={`#/history/${encodeURIComponent(fast.id)}`}>
        card
      </a>
      {expanded && (
        <div className="history-row-detail">
          <p className="mono">
            {formatDateTime(fast.startedAt)} &rarr; {formatDateTime(fast.endedAt)}
          </p>
          {fast.note && <p>{fast.note}</p>}
        </div>
      )}
    </li>
  )
}

// A completed fast's card (feature request #6, ISSUES.md): a static echo
// of the live Timer ring, reached from a chart bar or a history row's
// "card" link. Deliberately its own simple static SVG, not the live
// <Ring> (built for a per-frame animation loop and an imperative handle
// that a finished, unchanging record has no use for), and no glow/backdrop
// treatment -- that visual language signals "a fast is happening right
// now" elsewhere in the app, which would misrepresent a historical record.
function FastCard({ fast }: { fast: CompletedFast }) {
  const durationMs = fast.endedAt - fast.startedAt
  const goalMs = fast.goalHours * HOUR_MS
  const progress = goalMs > 0 ? Math.min(durationMs / goalMs, 1) : 1

  return (
    <main className="shell">
      <div className="eyebrow-row">
        <a className="eyebrow-link" href="#/history">
          &larr; back to history
        </a>
        <p className="eyebrow">card</p>
      </div>

      <div className="history-card">
        <FastRingBadge progress={progress} />
        <p className="history-card-duration">{formatDuration(durationMs)}</p>
        <p className="history-card-goal">{hourGoalLabel(fast.goalHours)}</p>
        <p className="mono history-card-range">
          {formatDateTime(fast.startedAt)} &rarr; {formatDateTime(fast.endedAt)}
        </p>
        {fast.note && <p className="history-card-note">{fast.note}</p>}
      </div>
    </main>
  )
}

const RING_R = 100
const RING_C = 2 * Math.PI * RING_R

function FastRingBadge({ progress }: { progress: number }) {
  return (
    <svg
      className="history-ring"
      viewBox="0 0 240 240"
      role="img"
      aria-label={`${Math.round(progress * 100)} percent of goal reached`}
    >
      <circle className="history-ring-track" cx={120} cy={120} r={RING_R} strokeWidth={12} fill="none" />
      <circle
        cx={120}
        cy={120}
        r={RING_R}
        strokeWidth={12}
        fill="none"
        stroke={ringColor(progress)}
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - progress)}
        transform="rotate(-90 120 120)"
      />
    </svg>
  )
}
