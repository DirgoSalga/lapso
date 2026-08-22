import { describe, expect, it } from 'vitest'
import { dueMilestones, milestoneKeys, MAX_OVERTIME_MILESTONES } from './milestones'

const H = 3_600_000

describe('milestoneKeys()', () => {
  it('emits percent keys in input order as they are passed', () => {
    expect(milestoneKeys(15 * H, 16 * H, [50, 90], 0)).toEqual(['p50', 'p90'])
  })

  it('does not emit unpassed percents', () => {
    expect(milestoneKeys(5 * H, 16 * H, [50, 90], 0)).toEqual([])
  })

  it('emits the goal key exactly at the goal boundary', () => {
    expect(milestoneKeys(16 * H, 16 * H, [50, 90], 0)).toContain('goal')
    expect(milestoneKeys(16 * H - 1, 16 * H, [50, 90], 0)).not.toContain('goal')
  })

  it('emits overtime keys up to the cap of 3', () => {
    expect(milestoneKeys(20 * H, 16 * H, [50, 90], 3.5)).toContain('ot3')
    expect(milestoneKeys(20 * H, 16 * H, [50, 90], 3.5).filter((k) => k.startsWith('ot'))).toHaveLength(
      MAX_OVERTIME_MILESTONES,
    )
  })

  it('ignores percents outside 1 to 99', () => {
    expect(milestoneKeys(16 * H, 16 * H, [0, 50, 100, 150], 0)).toEqual(['p50', 'goal'])
  })
})

describe('dueMilestones()', () => {
  it('returns only keys not already fired', () => {
    const due = dueMilestones(18 * H, 16 * H, [50, 90], 2, ['p50'])
    expect(due).toEqual(['p90', 'goal', 'ot1', 'ot2'])
  })

  it('returns empty once everything passed is fired', () => {
    const due = dueMilestones(18 * H, 16 * H, [50, 90], 2, ['p50', 'p90', 'goal', 'ot1', 'ot2'])
    expect(due).toEqual([])
  })

  it('never returns duplicate keys', () => {
    const due = dueMilestones(18 * H, 16 * H, [50, 90], 2, [])
    expect(new Set(due).size).toBe(due.length)
  })
})
