import { formatElapsedClock, hourGoalLabel, HOUR_MS } from './clock'
import { oklchToString, ringColor, surfaceColor, TEXT_PRIMARY, TEXT_SECONDARY } from './color'
import type { Theme } from './color'
import { formatDateTime } from './time'
import type { CompletedFast } from './types'

const WIDTH = 1080
const HEIGHT = 1350
const CARD_MARGIN = 64
const CARD_RADIUS = 48

export function isShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

export function shareFileName(startedAt: number): string {
  const d = new Date(startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `lapso-fast-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.png`
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  let line = ''
  let cursorY = y
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (line && ctx.measureText(testLine).width > maxWidth) {
      ctx.fillText(line, x, cursorY)
      line = word
      cursorY += lineHeight
    } else {
      line = testLine
    }
  }
  if (line) ctx.fillText(line, x, cursorY)
}

// Renders a completed fast as a standalone shareable PNG (feature request
// #7, ISSUES.md) -- a real image file for the OS share sheet, not a link
// back to the app: the app is only reachable inside Diego's netbird mesh,
// so a link would be dead for anyone outside it. Deliberately a
// purpose-built canvas rendering, not a DOM screenshot (no html2canvas/
// dom-to-image dependency -- SPEC.md's <=3 runtime dep budget): shares the
// on-screen card's colour tokens, ring, and HH:MM:SS notation, but is its
// own simplified static composition -- no shine animation (nothing to
// animate in a still image) and a fixed type weight instead of the live
// readout's progress-driven variable-font thickening (canvas text doesn't
// portably drive font-variation-settings).
export async function renderFastShareImage(fast: CompletedFast, theme: Theme): Promise<Blob> {
  const durationMs = fast.endedAt - fast.startedAt
  const goalMs = fast.goalHours * HOUR_MS
  const progress = goalMs > 0 ? Math.min(durationMs / goalMs, 1) : 1

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  if (typeof document.fonts?.ready?.then === 'function') {
    await document.fonts.ready
  }

  const glow = ringColor(progress)
  const textPrimary = oklchToString(TEXT_PRIMARY[theme])
  const textSecondary = oklchToString(TEXT_SECONDARY[theme])
  const surface = surfaceColor(progress, theme)

  // Background: the same progress-driven "heat wash" the live body uses
  // (spec §5.2), frozen at this fast's own final progress.
  ctx.fillStyle = surface
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // Dot-grid texture (feature request #4): a flat low-alpha grid, not the
  // live version's radial fade -- this is a one-shot render, not a
  // perf-sensitive live surface, so the simplification isn't buying
  // anything here.
  ctx.fillStyle = textSecondary
  ctx.globalAlpha = 0.15
  const DOT_GAP = 34
  for (let y = DOT_GAP / 2; y < HEIGHT; y += DOT_GAP) {
    for (let x = DOT_GAP / 2; x < WIDTH; x += DOT_GAP) {
      ctx.beginPath()
      ctx.arc(x, y, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  const cardX = CARD_MARGIN
  const cardY = CARD_MARGIN
  const cardW = WIDTH - CARD_MARGIN * 2
  const cardH = HEIGHT - CARD_MARGIN * 2

  // Card fill, with a soft shadow standing in for the live card's animated
  // glowing edge -- static is the honest representation for a still image.
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = 60
  ctx.fillStyle = surface
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fill()
  ctx.restore()

  ctx.strokeStyle = glow
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.stroke()

  // Eyebrow: brand mark, matching the live/history card's own eyebrow row.
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = textSecondary
  ctx.font = '600 26px "IBM Plex Mono", ui-monospace, monospace'
  ctx.fillText('LAPSO', cardX + 48, cardY + 80)

  // Ring, with duration + goal centred inside it (matching History's
  // .history-ring-wrap/.history-readout layout).
  const ringCx = WIDTH / 2
  const ringCy = cardY + 440
  const ringR = 260
  ctx.lineWidth = 28
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2)
  ctx.strokeStyle = textSecondary
  ctx.globalAlpha = 0.18
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.beginPath()
  ctx.arc(ringCx, ringCy, ringR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
  ctx.strokeStyle = glow
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = textPrimary
  ctx.font = '600 96px "Fraunces Variable", Georgia, serif'
  ctx.fillText(formatElapsedClock(durationMs), ringCx, ringCy + 32)

  ctx.font = '400 32px "IBM Plex Sans Variable", system-ui, sans-serif'
  ctx.fillStyle = textSecondary
  ctx.fillText(hourGoalLabel(fast.goalHours), ringCx, ringCy + 84)

  // Date range
  ctx.font = '400 30px "IBM Plex Mono", ui-monospace, monospace'
  ctx.fillStyle = textSecondary
  ctx.fillText(`${formatDateTime(fast.startedAt)} → ${formatDateTime(fast.endedAt)}`, ringCx, ringCy + ringR + 100)

  if (fast.note) {
    ctx.font = '400 34px "IBM Plex Sans Variable", system-ui, sans-serif'
    ctx.fillStyle = textPrimary
    wrapText(ctx, fast.note, ringCx, ringCy + ringR + 170, cardW - 160, 44)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render share image'))
    }, 'image/png')
  })
}
