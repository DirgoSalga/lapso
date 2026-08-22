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

// --- sRGB <-> OKLab, so the spec's literal hex tokens (§5.2) are the one
// source of truth and the JS ramp can never drift from them by hand-typo. ---

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearChannelToSrgb(c: number): number {
  const clamped = clamp01(c)
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055
}

type Vec3 = [number, number, number]

function hexToLinearSrgb(hex: string): Vec3 {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b)]
}

// Reference matrices: https://bottosson.github.io/posts/oklab/
function linearSrgbToOklab([r, g, b]: Vec3): { l: number; a: number; b: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

function oklabToLinearSrgb({ l, a, b }: { l: number; a: number; b: number }): Vec3 {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

export function hexToOklch(hex: string): OklchColor {
  const { l, a, b } = linearSrgbToOklab(hexToLinearSrgb(hex))
  const c = Math.sqrt(a * a + b * b)
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return { l, c, h: (h + 360) % 360 }
}

export function oklchToHex(color: OklchColor): string {
  const hRad = (color.h * Math.PI) / 180
  const [r, g, b] = oklabToLinearSrgb({
    l: color.l,
    a: color.c * Math.cos(hRad),
    b: color.c * Math.sin(hRad),
  })
  const toHex = (c: number) =>
    Math.round(linearChannelToSrgb(c) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// spec §11: relative luminance and WCAG contrast ratio, computed directly
// from the linear-light RGB that falls out of the OKLab conversion (the
// WCAG formula's "linearized" step is exactly that, so no extra round trip
// through gamma-encoded sRGB is needed).
export function relativeLuminance(color: OklchColor): number {
  const hRad = (color.h * Math.PI) / 180
  const [r, g, b] = oklabToLinearSrgb({
    l: color.l,
    a: color.c * Math.cos(hRad),
    b: color.c * Math.sin(hRad),
  })
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b)
}

export function contrastRatio(a: OklchColor, b: OklchColor): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

// --- surfaces: the whole screen heats up with progress (spec §5.2), held
// at the goal stop beyond progress 1 for the same escalation plateau as
// the ring (spec §9.1). ---

export type Theme = 'day' | 'night'

const SURFACE_COLD: Record<Theme, OklchColor> = {
  day: hexToOklch('#E9EDF0'), // --porcelain
  night: hexToOklch('#181B20'),
}
const SURFACE_GOAL: Record<Theme, OklchColor> = {
  day: hexToOklch('#F0E3D2'), // --bisque
  night: hexToOklch('#241D18'),
}
export const TEXT_PRIMARY: Record<Theme, OklchColor> = {
  day: hexToOklch('#2A2E35'), // --graphite
  night: hexToOklch('#E9EDF0'),
}
export const TEXT_SECONDARY: Record<Theme, OklchColor> = {
  day: hexToOklch('#596472'), // --slate (darkened for AA; see tokens.css)
  night: hexToOklch('#8B96A3'),
}

export function surfaceColorOklch(progress: number, theme: Theme = 'day'): OklchColor {
  const p = Math.min(Math.max(progress, 0), 1)
  return lerpOklch(SURFACE_COLD[theme], SURFACE_GOAL[theme], p)
}

export function surfaceColor(progress: number, theme: Theme = 'day'): string {
  return oklchToString(surfaceColorOklch(progress, theme))
}

export function resolveTheme(settingsTheme: 'auto' | 'day' | 'night', prefersDark: boolean): Theme {
  if (settingsTheme === 'day') return 'day'
  if (settingsTheme === 'night') return 'night'
  return prefersDark ? 'night' : 'day'
}

// spec §5.3: under reduced motion, the Fraunces variable axes snap to three
// fixed steps instead of animating continuously with progress. The steps
// line up with the ring's own cold/mid/goal stops (spec §5.2).
export function snapProgressStep(progress: number): number {
  const p = Math.min(Math.max(progress, 0), 1)
  if (p < 0.5) return 0
  if (p < 1) return 0.5
  return 1
}
