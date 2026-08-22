import { describe, expect, it } from 'vitest'
import { RING_COLD, RING_GOAL, RING_MID, ringColorOklch } from './color'

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
