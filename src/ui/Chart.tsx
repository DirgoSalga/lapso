import type { CompletedFast } from '../core/types'
import { HOUR_MS, hourGoalLabel, pluralHours } from '../core/clock'

const WIDTH = 320
const HEIGHT = 120
const PADDING_X = 4
const BAR_GAP = 3
const MAX_BARS = 30

interface ChartProps {
  history: CompletedFast[]
  goalHours: number
}

// Hand-rolled SVG bar chart of the last 30 fasts (spec §8). Bars are a
// single neutral color at every height and a hairline marks the current
// default goal -- durations are facts, not verdicts (spec §9.6): no
// red/green, no threshold the chart treats as pass or fail.
export function Chart({ history, goalHours }: ChartProps) {
  const recent = history.slice(-MAX_BARS)

  if (recent.length === 0) {
    return null
  }

  const durationsHours = recent.map((fast) => (fast.endedAt - fast.startedAt) / HOUR_MS)
  const maxHours = Math.max(goalHours, ...durationsHours) * 1.1
  const plotHeight = HEIGHT - 16 // leaves room for the hairline label
  const barWidth = (WIDTH - PADDING_X * 2 - BAR_GAP * (recent.length - 1)) / recent.length
  const hairlineY = plotHeight - (goalHours / maxHours) * plotHeight

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Bar chart of the last ${recent.length} fasts, with a hairline at the ${hourGoalLabel(goalHours)}`}
      >
        <line
          className="chart-hairline"
          x1={0}
          x2={WIDTH}
          y1={hairlineY}
          y2={hairlineY}
          stroke="var(--slate)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        {recent.map((fast, i) => {
          const hours = durationsHours[i] ?? 0
          const barHeight = Math.max(1, (hours / maxHours) * plotHeight)
          const x = PADDING_X + i * (barWidth + BAR_GAP)
          const y = plotHeight - barHeight
          return (
            <rect key={fast.id} className="chart-bar" x={x} y={y} width={barWidth} height={barHeight}>
              <title>{pluralHours(Math.round(hours * 10) / 10)}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="chart-caption">
        Last {recent.length} fast{recent.length === 1 ? '' : 's'}. Hairline at the {hourGoalLabel(goalHours)}.
      </figcaption>
    </figure>
  )
}
