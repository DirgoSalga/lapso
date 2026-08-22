import { describe, expect, it } from 'vitest'
import {
  RING_COLD,
  RING_GOAL,
  RING_MID,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  contrastRatio,
  hexToOklch,
  oklchToHex,
  resolveTheme,
  ringColorOklch,
  snapProgressStep,
  surfaceColorOklch,
  type Theme,
} from './color'

describe('ringColorOklch()', () => {
  it('is exactly the cold stop at progress 0', () => {
    expect(ringColorOklch(0)).toEqual(RING_COLD)
  })

  it('is exactly the mid stop at progress 0.5 (spec §5.2 midpoint)', () => {
    expect(ringColorOklch(0.5)).toEqual(RING_MID)
  })

  it('is exactly the goal stop at progress 1', () => {
    expect(ringColorOklch(1)).toEqual(RING_GOAL)
  })

  it('interpolates monotonically in lightness across the first half', () => {
    const a = ringColorOklch(0.1)
    const b = ringColorOklch(0.3)
    const c = ringColorOklch(0.5)
    expect(a.l).toBeLessThan(b.l)
    expect(b.l).toBeLessThan(c.l)
  })

  it('holds at the goal color beyond progress 1 (escalation plateau, spec §9.1)', () => {
    expect(ringColorOklch(1.5)).toEqual(RING_GOAL)
    expect(ringColorOklch(10)).toEqual(RING_GOAL)
  })

  it('clamps below 0 to the cold stop', () => {
    expect(ringColorOklch(-0.5)).toEqual(RING_COLD)
  })
})

describe('hex <-> oklch round trip', () => {
  const samples = ['#E9EDF0', '#F0E3D2', '#2A2E35', '#596472', '#181B20', '#241D18', '#8B96A3']

  it.each(samples)('recovers %s within one hex step of rounding error', (hex) => {
    const roundTripped = oklchToHex(hexToOklch(hex))
    const toRgb = (h: string): [number, number, number] => [
      Number.parseInt(h.slice(1, 3), 16),
      Number.parseInt(h.slice(3, 5), 16),
      Number.parseInt(h.slice(5, 7), 16),
    ]
    const [r1, g1, b1] = toRgb(hex)
    const [r2, g2, b2] = toRgb(roundTripped)
    expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1)
    expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1)
    expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1)
  })
})

describe('surfaceColorOklch()', () => {
  it('is the porcelain/graphite-day cold stop at progress 0', () => {
    expect(oklchToHex(surfaceColorOklch(0, 'day'))).toBe('#e9edf0')
  })

  it('is the bisque goal stop at progress 1', () => {
    expect(oklchToHex(surfaceColorOklch(1, 'day'))).toBe('#f0e3d2')
  })

  it('holds at the goal stop beyond progress 1 (escalation plateau, spec §9.1)', () => {
    expect(surfaceColorOklch(1.5, 'day')).toEqual(surfaceColorOklch(1, 'day'))
  })

  it('is the night cold/goal stops for the night theme', () => {
    expect(oklchToHex(surfaceColorOklch(0, 'night'))).toBe('#181b20')
    expect(oklchToHex(surfaceColorOklch(1, 'night'))).toBe('#241d18')
  })
})

// spec §11: "All text meets WCAG AA against its surface at every point in
// the heat ramp. Check the mid-ramp values specifically, they are the ones
// that fail." This is the trap PLAN.md calls out by name — record the
// actual ratios so a future edit that breaks this fails loudly, not silently.
describe('contrast across the full heat ramp (spec §11)', () => {
  const progressSamples = Array.from({ length: 11 }, (_, i) => i / 10)
  const themes: Theme[] = ['day', 'night']
  const AA_NORMAL_TEXT = 4.5

  for (const theme of themes) {
    for (const progress of progressSamples) {
      it(`primary text meets AA (${AA_NORMAL_TEXT}:1) on the ${theme} surface at progress ${progress}`, () => {
        const ratio = contrastRatio(TEXT_PRIMARY[theme], surfaceColorOklch(progress, theme))
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      })

      it(`secondary text meets AA (${AA_NORMAL_TEXT}:1) on the ${theme} surface at progress ${progress}`, () => {
        const ratio = contrastRatio(TEXT_SECONDARY[theme], surfaceColorOklch(progress, theme))
        expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      })
    }
  }
})

describe('resolveTheme()', () => {
  it('honors an explicit day or night setting regardless of OS preference', () => {
    expect(resolveTheme('day', true)).toBe('day')
    expect(resolveTheme('night', false)).toBe('night')
  })

  it('follows the OS preference when set to auto', () => {
    expect(resolveTheme('auto', true)).toBe('night')
    expect(resolveTheme('auto', false)).toBe('day')
  })
})

describe('snapProgressStep() (spec §5.3 reduced-motion axis steps)', () => {
  it('snaps to the cold, mid and goal stops matching the ring ramp', () => {
    expect(snapProgressStep(0)).toBe(0)
    expect(snapProgressStep(0.2)).toBe(0)
    expect(snapProgressStep(0.49)).toBe(0)
    expect(snapProgressStep(0.5)).toBe(0.5)
    expect(snapProgressStep(0.8)).toBe(0.5)
    expect(snapProgressStep(0.99)).toBe(0.5)
    expect(snapProgressStep(1)).toBe(1)
  })

  it('holds at the goal step throughout overtime', () => {
    expect(snapProgressStep(1.5)).toBe(1)
  })
})
