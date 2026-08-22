export interface OklchColor {
  l: number
  c: number
  h: number
}

export function oklchToString({ l, c, h }: OklchColor): string {
  return `oklch(${l} ${c} ${h})`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Hue is circular; interpolate along the shorter arc so the ramp never
// swings the long way around the color wheel.
function lerpHue(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180
  return (a + delta * t + 360) % 360
}

function lerpOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  return { l: lerp(a.l, b.l, t), c: lerp(a.c, b.c, t), h: lerpHue(a.h, b.h, t) }
}

// spec §5.2 ring heat ramp
export const RING_COLD: OklchColor = { l: 0.55, c: 0.03, h: 250 }
export const RING_MID: OklchColor = { l: 0.78, c: 0.15, h: 70 }
export const RING_GOAL: OklchColor = { l: 0.58, c: 0.17, h: 42 }

// Three-point ramp: cold at progress 0, mid at progress 0.5, goal at
// progress 1. Progress is already clamped to [0, 1] upstream (clock.ts),
// so holding at RING_GOAL beyond that is what makes the ring stop
// escalating once the fast goes into overtime (spec §9.1).
export function ringColorOklch(progress: number): OklchColor {
  const p = Math.min(Math.max(progress, 0), 1)
  return p <= 0.5 ? lerpOklch(RING_COLD, RING_MID, p / 0.5) : lerpOklch(RING_MID, RING_GOAL, (p - 0.5) / 0.5)
}

export function ringColor(progress: number): string {
  return oklchToString(ringColorOklch(progress))
}

// A small lightness split around the current ring color, so the arc's
// linearGradient (spec §5.5) reads as a lit tube rather than a flat line,
// while still tracking the same progress-driven hue shift.
const GLOSS_DELTA_L = 0.06

export function ringGradientStops(progress: number): { start: string; end: string } {
  const base = ringColorOklch(progress)
  return {
    start: oklchToString({ ...base, l: Math.min(1, base.l + GLOSS_DELTA_L) }),
    end: oklchToString({ ...base, l: Math.max(0, base.l - GLOSS_DELTA_L) }),
  }
}
