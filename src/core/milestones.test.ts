import { describe, expect, it } from 'vitest'
import {
  catchUpCopy,
  dueMilestones,
  headlineMilestone,
  milestoneCopy,
  milestoneKeys,
  MAX_OVERTIME_MILESTONES,
} from './milestones'

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

describe('milestoneCopy() (spec §6.4, verbatim for the default percents)', () => {
  const goalMs = 16 * H

  it('50%: "Half way. 8 hours in."', () => {
    expect(milestoneCopy({ key: 'p50', goalHours: 16, goalMs, elapsedMs: 8 * H })).toBe('Half way. 8 hours in.')
  })

  it('90%: "1 hour 36 minutes to your goal."', () => {
    const elapsedMs = goalMs - (1 * H + 36 * 60_000)
    expect(milestoneCopy({ key: 'p90', goalHours: 16, goalMs, elapsedMs })).toBe('1 hour 36 minutes to your goal.')
  })

  it('goal: "16 hours reached."', () => {
    expect(milestoneCopy({ key: 'goal', goalHours: 16, goalMs, elapsedMs: goalMs })).toBe('16 hours reached.')
  })

  it('overtime: "17 hours. Still going."', () => {
    expect(milestoneCopy({ key: 'ot1', goalHours: 16, goalMs, elapsedMs: 17 * H })).toBe('17 hours. Still going.')
  })

  it('generalizes the "to your goal" phrasing to any non-50 percent', () => {
    const elapsedMs = goalMs - 30 * 60_000
    expect(milestoneCopy({ key: 'p75', goalHours: 16, goalMs, elapsedMs })).toBe('30 minutes to your goal.')
  })
})

describe('catchUpCopy() (spec §6.3)', () => {
  const goalMs = 16 * H

  it('phrases the goal retrospectively: "You passed your 16 hour goal 40 minutes ago."', () => {
    const elapsedMs = goalMs + 40 * 60_000
    expect(catchUpCopy({ key: 'goal', goalHours: 16, goalMs, elapsedMs })).toBe(
      'You passed your 16 hour goal 40 minutes ago.',
    )
  })

  it('adds "Still going." for a missed overtime milestone', () => {
    const elapsedMs = goalMs + 90 * 60_000
    expect(catchUpCopy({ key: 'ot1', goalHours: 16, goalMs, elapsedMs })).toBe(
      'You passed your 16 hour goal 1 hour 30 minutes ago. Still going.',
    )
  })

  it('phrases a missed percent milestone relative to when it was crossed, not the goal', () => {
    const elapsedMs = goalMs * 0.5 + 10 * 60_000 // 10 minutes past the 50% mark
    expect(catchUpCopy({ key: 'p50', goalHours: 16, goalMs, elapsedMs })).toBe(
      'You passed the 50 percent milestone 10 minutes ago.',
    )
  })
})

describe('headlineMilestone() (spec §6.3: one card, not a burst)', () => {
  it('picks the most-advanced of several simultaneously-due keys', () => {
    expect(headlineMilestone(['p50', 'p90', 'goal', 'ot1'])).toBe('ot1')
  })

  it('is undefined when nothing is due', () => {
    expect(headlineMilestone([])).toBeUndefined()
  })
})
