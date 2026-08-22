import { useEffect, useState } from 'react'
import { formatDuration, hourGoalLabel } from '../core/clock'
import { formatDateTime } from '../core/time'
import { loadHistory, loadSettings, subscribe } from '../core/storage'
import type { CompletedFast } from '../core/types'
import { Chart } from './Chart'

export function History() {
  const [history, setHistory] = useState<CompletedFast[]>(() => loadHistory())
  const [defaultGoalHours, setDefaultGoalHours] = useState(() => loadSettings().defaultGoalHours)

  useEffect(
    () =>
      subscribe(() => {
        setHistory(loadHistory())
        setDefaultGoalHours(loadSettings().defaultGoalHours)
      }),
    [],
  )

  const reverseChronological = [...history].reverse() // history is newest-last

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
