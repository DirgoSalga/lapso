import { useMemo } from 'react'
import type { CSSProperties } from 'react'

// Warm hues drawn from the app's own heat-ramp tokens (tokens.css --glow,
// --ember) plus a couple of related warm/cool accents, so "colourful" still
// reads as this app's palette rather than a generic rainbow.
const CONFETTI_COLORS = ['#f2a03d', '#bf4a17', '#f0c987', '#d97a4a', '#7a8fa6']
const PIECE_COUNT = 32

interface ConfettiPieceStyle extends CSSProperties {
  '--drift': string
  '--spin': string
}

function randomPieceStyle(): ConfettiPieceStyle {
  const size = 5 + Math.random() * 4
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? CONFETTI_COLORS[0]
  return {
    left: `${Math.random() * 100}%`,
    width: size,
    height: size * 0.4,
    backgroundColor: color,
    animationDelay: `${Math.random() * 0.4}s`,
    animationDuration: `${2.2 + Math.random() * 1.2}s`,
    '--drift': `${(Math.random() - 0.5) * 60}px`,
    '--spin': `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360)}deg`,
  }
}

// Celebrates crossing the goal (feature request #3, ISSUES.md). Timer.tsx
// mounts this only for a few seconds on the live fasting->overtime crossing,
// and only when motion isn't reduced -- both gates live there, not here.
export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: PIECE_COUNT }, randomPieceStyle), [])

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="confetti-piece" style={style} />
      ))}
    </div>
  )
}
