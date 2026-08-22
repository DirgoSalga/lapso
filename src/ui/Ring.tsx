import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { ringColor, ringGradientStops } from '../core/color'

const CENTER = 120
const TRACK_R = 100
const TRACK_SW = 12
const OVERTIME_R = 116
const OVERTIME_SW = 4
const TRACK_C = 2 * Math.PI * TRACK_R
const OVERTIME_C = 2 * Math.PI * OVERTIME_R
const LAP_DOT_BASE_R = OVERTIME_R + 8
const LAP_DOT_STEP = 6
const LAP_DOT_RADIUS = 2.5
const SVG_NS = 'http://www.w3.org/2000/svg'

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }
}

export interface RingFrame {
  progress: number // 0-1, fraction of goal
  lapProgress: number // 0-1, fraction of the current overtime hour
  intensity: number // 0-1, ambient glow opacity (spec §4.2 plateau)
}

export interface RingReadout {
  ariaValueNow: number // 0-100
  ariaValueText: string
  progressPercent: number // 0-100, same basis as milestone tick percents
  lapIndex: number
}

export interface RingHandle {
  writeFrame(frame: RingFrame): void
  writeReadout(readout: RingReadout): void
  /** spec §5.6: one 900ms flourish, exactly once per fast, at the goal crossing. */
  triggerGoalSwell(): void
}

const GOAL_SWELL_MS = 900

interface RingProps {
  milestonePercents: number[]
}

export const Ring = forwardRef<RingHandle, RingProps>(function Ring({ milestonePercents }, ref) {
  const svgRef = useRef<SVGSVGElement>(null)
  const progressArcRef = useRef<SVGCircleElement>(null)
  const overtimeArcRef = useRef<SVGCircleElement>(null)
  const glowRef = useRef<SVGCircleElement>(null)
  const gradientStartRef = useRef<SVGStopElement>(null)
  const gradientEndRef = useRef<SVGStopElement>(null)
  const lapDotsRef = useRef<SVGGElement>(null)
  const tickRefs = useRef<(SVGLineElement | null)[]>([])
  const lastLapIndexRef = useRef(-1)

  const ticks = useMemo(
    () => milestonePercents.map((pct) => ({ pct, angle: (360 * pct) / 100 - 90 })),
    [milestonePercents],
  )

  useImperativeHandle(
    ref,
    () => ({
      writeFrame({ progress, lapProgress, intensity }) {
        if (progressArcRef.current) {
          progressArcRef.current.style.strokeDashoffset = String(TRACK_C * (1 - progress))
        }
        if (overtimeArcRef.current) {
          overtimeArcRef.current.style.strokeDashoffset = String(OVERTIME_C * (1 - lapProgress))
        }
        if (glowRef.current) {
          glowRef.current.style.opacity = String(intensity)
          glowRef.current.setAttribute('stroke', ringColor(progress))
        }
        const { start, end } = ringGradientStops(progress)
        gradientStartRef.current?.setAttribute('stop-color', start)
        gradientEndRef.current?.setAttribute('stop-color', end)
      },
      writeReadout({ ariaValueNow, ariaValueText, progressPercent, lapIndex }) {
        const svg = svgRef.current
        if (svg) {
          svg.setAttribute('aria-valuenow', String(ariaValueNow))
          svg.setAttribute('aria-valuetext', ariaValueText)
        }
        for (const [i, tick] of ticks.entries()) {
          tickRefs.current[i]?.setAttribute('data-passed', String(progressPercent >= tick.pct))
        }
        if (lapIndex !== lastLapIndexRef.current) {
          lastLapIndexRef.current = lapIndex
          const dots = Array.from({ length: lapIndex }, (_, i) => {
            const dot = document.createElementNS(SVG_NS, 'circle')
            const { x, y } = polar(-90, LAP_DOT_BASE_R + i * LAP_DOT_STEP)
            dot.setAttribute('cx', String(x))
            dot.setAttribute('cy', String(y))
            dot.setAttribute('r', String(LAP_DOT_RADIUS))
            dot.setAttribute('class', 'ring-lap-dot')
            return dot
          })
          lapDotsRef.current?.replaceChildren(...dots)
        }
      },
      triggerGoalSwell() {
        const swellColor = ringColor(1) // solid --ember, no gloss split, for the flash
        gradientStartRef.current?.setAttribute('stop-color', swellColor)
        gradientEndRef.current?.setAttribute('stop-color', swellColor)
        gradientStartRef.current?.classList.add('ring-swell-transition')
        gradientEndRef.current?.classList.add('ring-swell-transition')
        glowRef.current?.classList.add('ring-swell-glow')
        window.setTimeout(() => {
          gradientStartRef.current?.classList.remove('ring-swell-transition')
          gradientEndRef.current?.classList.remove('ring-swell-transition')
          glowRef.current?.classList.remove('ring-swell-glow')
        }, GOAL_SWELL_MS)
      },
    }),
    [ticks],
  )

  return (
    <svg
      ref={svgRef}
      className="ring"
      viewBox="0 0 240 240"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <defs>
        <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop ref={gradientStartRef} offset="0%" stopColor="var(--ring-cold)" />
          <stop ref={gradientEndRef} offset="100%" stopColor="var(--ring-cold)" />
        </linearGradient>
        <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <circle className="ring-track" cx={CENTER} cy={CENTER} r={TRACK_R} strokeWidth={TRACK_SW} fill="none" />

      <circle
        ref={glowRef}
        className="ring-glow"
        cx={CENTER}
        cy={CENTER}
        r={TRACK_R}
        strokeWidth={TRACK_SW + 10}
        fill="none"
        filter="url(#ring-glow)"
        style={{ opacity: 0 }}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
        strokeDasharray={TRACK_C}
        strokeDashoffset={TRACK_C}
      />

      <circle
        ref={progressArcRef}
        className="ring-progress"
        cx={CENTER}
        cy={CENTER}
        r={TRACK_R}
        strokeWidth={TRACK_SW}
        fill="none"
        strokeLinecap="round"
        stroke="url(#ring-gradient)"
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
        strokeDasharray={TRACK_C}
        strokeDashoffset={TRACK_C}
      />

      <circle
        ref={overtimeArcRef}
        className="ring-overtime"
        cx={CENTER}
        cy={CENTER}
        r={OVERTIME_R}
        strokeWidth={OVERTIME_SW}
        fill="none"
        strokeLinecap="round"
        stroke="var(--ember)"
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
        strokeDasharray={OVERTIME_C}
        strokeDashoffset={OVERTIME_C}
      />

      <g ref={lapDotsRef} className="ring-lap-dots" />

      <g className="ring-ticks">
        {ticks.map((tick, i) => {
          const start = polar(0, 95)
          const end = polar(0, 101)
          return (
            <line
              key={tick.pct}
              ref={(el) => {
                tickRefs.current[i] = el
              }}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              transform={`rotate(${tick.angle} ${CENTER} ${CENTER})`}
              className="ring-tick"
              data-passed="false"
            />
          )
        })}
      </g>
    </svg>
  )
})

export const RING_CIRCUMFERENCE = TRACK_C
export const RING_OVERTIME_CIRCUMFERENCE = OVERTIME_C
