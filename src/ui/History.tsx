import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
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

// A completed fast's card (feature request #6, ISSUES.md), reached from a
// chart bar or a history row's "card" link. First pass deliberately used
// its own plain styling, reasoning the live .fast-card's glow/backdrop
// meant "happening right now" and would misrepresent a finished record.
// Revised per Diego (2026-08-26): reuses .fast-card itself (same
// translucent fill, padding, glowing edge) so the two screens read as the
// same design language. --fast-card-glow is set inline to this fast's own
// final ringColor(progress) rather than written per-frame like the live
// version -- there's no ongoing animation loop for a finished record, just
// a fixed value the same CSS variable the live card already reads.
// The ring badge stays its own simple static SVG rather than the live
// <Ring> (built around a per-frame animation loop and an imperative handle
// a finished, unchanging record has no use for).
function FastCard({ fast }: { fast: CompletedFast }) {
  const durationMs = fast.endedAt - fast.startedAt
  const goalMs = fast.goalHours * HOUR_MS
  const progress = goalMs > 0 ? Math.min(durationMs / goalMs, 1) : 1
  const glowStyle = { '--fast-card-glow': ringColor(progress) } as CSSProperties

  return (
    <main className="shell">
      <div className="fast-card" style={glowStyle}>
        <div className="eyebrow-row">
          <a className="eyebrow-link" href="#/history">
            &larr; back to history
          </a>
          <p className="eyebrow">card</p>
        </div>

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
