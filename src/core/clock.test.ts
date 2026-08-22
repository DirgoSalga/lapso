import { describe, expect, it } from 'vitest'
import { derive, formatDuration, formatElapsedClock, HOUR_MS, INTENSITY_CAP_HOURS, ABSURD_MS } from './clock'
import type { FastInput } from './clock'

const NOW = 1_700_000_000_000
const H = HOUR_MS

function input(overrides: Partial<FastInput> = {}): FastInput {
  return {
    startedAt: NOW - 16 * H,
    goalHours: 16,
    firedMilestones: [],
    milestonePercents: [50, 90],
    now: NOW,
    ...overrides,
  }
}

describe('derive(): phase boundaries', () => {
  it('is fasting before the goal', () => {
    const d = derive(input({ startedAt: NOW - 15 * H }))
    expect(d.phase).toBe('fasting')
    expect(d.hasReachedGoal).toBe(false)
    expect(d.overtimeMs).toBe(0)
  })

  it('is overtime exactly at the goal, regardless of whether the milestone is fired yet', () => {
    const d = derive(input({ startedAt: NOW - 16 * H }))
    expect(d.elapsedMs).toBe(16 * H)
    expect(d.progress).toBe(1)
    expect(d.phase).toBe('overtime')
    expect(d.hasReachedGoal).toBe(true)
    expect(d.dueMilestones).toContain('goal')

    const fired = derive(input({ startedAt: NOW - 16 * H, firedMilestones: ['goal'] }))
    expect(fired.phase).toBe('overtime')
    expect(fired.hasReachedGoal).toBe(true)
  })

  it('starts as fasting with zero elapsed', () => {
    const d = derive(input({ startedAt: NOW }))
    expect(d.elapsedMs).toBe(0)
    expect(d.progress).toBe(0)
    expect(d.phase).toBe('fasting')
    expect(d.intensity).toBe(0)
  })
})

describe('derive(): DST invariance (spec §14, plan Gate 1)', () => {
  const base = input()

  it('returns identical output under a DST tz (America/New_York)', () => {
    const inTz = withTz('America/New_York', () => derive(base))
    expect(inTz).toEqual(derive(base))
  })

  it('returns identical output under a non-transition tz (America/Phoenix)', () => {
    const inTz = withTz('America/Phoenix', () => derive(base))
    expect(inTz).toEqual(derive(base))
  })

  it('returns identical output under UTC and under the transition tz', () => {
    const inUtc = withTz('UTC', () => derive(base))
    const inNy = withTz('America/New_York', () => derive(base))
    expect(inNy).toEqual(inUtc)
  })

  it('measures the true 2h span when now straddles a DST transition (not the 3h wall-clock span)', () => {
    // 2026-03-08 01:30 EST to 04:30 EDT (spring forward, 2am skips to 3am):
    // 2 real hours apart, 3 hours on the wall clock.
    const start = Date.parse('2026-03-08T01:30:00-05:00')
    const end = Date.parse('2026-03-08T04:30:00-04:00')
    const straddling = withTz('America/New_York', () =>
      derive(input({ startedAt: start, now: end, goalHours: 48 })),
    )
    expect(end - start).toBe(2 * H)
    expect(straddling.elapsedMs).toBe(2 * H)
    expect(straddling.progress).toBeCloseTo(2 / 48, 10)
    expect(straddling.phase).toBe('fasting')
  })

  function withTz<T>(tz: string, fn: () => T): T {
    const prev = process.env.TZ
    process.env.TZ = tz
    try {
      return fn()
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  }
})

describe('derive(): clock rollback', () => {
  it('flags clockSkew when now precedes startedAt', () => {
    const d = derive(input({ startedAt: NOW + H }))
    expect(d.clockSkew).toBe(true)
    expect(d.elapsedMs).toBe(0)
    expect(d.phase).toBe('fasting')
  })

  it('does not flag clockSkew at equal or later times', () => {
    expect(derive(input()).clockSkew).toBe(false)
    expect(derive(input({ startedAt: NOW })).clockSkew).toBe(false)
  })
})

describe('derive(): goalHours edges', () => {
  it('handles goalHours = 0 without dividing by zero: at goal the instant a fast starts', () => {
    const d = derive(input({ goalHours: 0, startedAt: NOW }))
    expect(d.goalMs).toBe(0)
    expect(d.progress).toBe(1)
    expect(d.hasReachedGoal).toBe(true)
    expect(d.dueMilestones).toEqual(['goal'])
  })

  it('derives a 1 hour goal correctly', () => {
    const d = derive(input({ goalHours: 1, startedAt: NOW - 90 * 60_000 }))
    expect(d.goalMs).toBe(H)
    expect(d.progress).toBe(1)
    expect(d.phase).toBe('overtime')
    expect(d.overtimeHours).toBeCloseTo(0.5)
  })

  it('derives a 48 hour goal correctly', () => {
    const d = derive(input({ goalHours: 48, startedAt: NOW - 24 * H }))
    expect(d.progress).toBeCloseTo(0.5, 10)
    expect(d.phase).toBe('fasting')
  })

  it('clamps progress to 1 at any goal size', () => {
    const d = derive(input({ goalHours: 48, startedAt: NOW - 60 * H }))
    expect(d.progress).toBe(1)
  })
})

describe('derive(): intensity plateau (spec §9.1, plan Gate 1)', () => {
  it('reaches 1 exactly at the INTENSITY_CAP_HOURS cap', () => {
    const d = derive(input({ startedAt: NOW - (16 + INTENSITY_CAP_HOURS) * H }))
    expect(d.overtimeHours).toBeCloseTo(2)
    expect(d.intensity).toBe(1)
  })

  it('is identical at 2 hours past goal and 6 hours past goal', () => {
    const two = derive(input({ startedAt: NOW - 18 * H }))
    const six = derive(input({ startedAt: NOW - 22 * H }))
    expect(six.intensity).toBe(two.intensity)
    expect(six.overtimeMs - two.overtimeMs).toBe(4 * H)
  })
})

describe('derive(): laps', () => {
  it('has zero laps before the goal', () => {
    const d = derive(input({ startedAt: NOW - 15 * H }))
    expect(d.lapIndex).toBe(0)
    expect(d.lapProgress).toBe(0)
  })

  it('has one complete lap at 1 hour past goal', () => {
    const d = derive(input({ startedAt: NOW - 17 * H }))
    expect(d.lapIndex).toBe(1)
    expect(d.lapProgress).toBeCloseTo(0, 9)
  })

  it('shows 0.5 lap progress at 1.5 hours past goal', () => {
    const d = derive(input({ startedAt: NOW - 17.5 * H }))
    expect(d.lapIndex).toBe(1)
    expect(d.lapProgress).toBeCloseTo(0.5)
  })

  it('has three complete laps at 3 hours past goal', () => {
    const d = derive(input({ startedAt: NOW - 19 * H }))
    expect(d.lapIndex).toBe(3)
    expect(d.lapProgress).toBeCloseTo(0, 9)
  })
})

describe('derive(): absurd durations (spec §10)', () => {
  it('is not absurd at or under 168 hours', () => {
    const d = derive(input({ startedAt: NOW - 168 * H, goalHours: 48 }))
    expect(d.absurd).toBe(false)
  })

  it('is absurd beyond 168 hours', () => {
    const d = derive(input({ startedAt: NOW - 200 * H, goalHours: 48 }))
    expect(d.absurd).toBe(true)
    expect(ABSURD_MS).toBe(168 * H)
  })
})

describe('derive(): dueMilestones', () => {
  it('returns percent, goal and overtime keys as they are passed', () => {
    const d = derive(input({ startedAt: NOW - 18.5 * H, milestonePercents: [50, 90] }))
    expect(d.dueMilestones).toEqual(['p50', 'p90', 'goal', 'ot1', 'ot2'])
  })

  it('excludes already-fired milestones and stays empty after they are persisted', () => {
    const before = derive(input({ startedAt: NOW - 18.5 * H }))
    const after = derive(input({ startedAt: NOW - 18.5 * H, firedMilestones: before.dueMilestones }))
    expect(after.dueMilestones).toEqual([])
  })

  it('dedupes when two percents land on the same instant', () => {
    const d = derive(input({ startedAt: NOW - 16 * H, milestonePercents: [100, 100] }))
    expect(d.dueMilestones.filter((k) => k === 'goal')).toHaveLength(1)
  })

  it('emits no percent milestones for a zero-hour goal', () => {
    const d = derive(input({ goalHours: 0, startedAt: NOW, milestonePercents: [50] }))
    expect(d.dueMilestones).toEqual(['goal'])
  })

  it('fires each overtime milestone once per hour, max 3', () => {
    const d = derive(input({ startedAt: NOW - 21.5 * H }))
    expect(d.dueMilestones).toEqual(['p50', 'p90', 'goal', 'ot1', 'ot2', 'ot3'])
  })
})

describe('formatDuration()', () => {
  it('matches the spec §11 aria-valuetext and §6.4 copy', () => {
    expect(formatDuration(14 * H + 22 * 60_000)).toBe('14 hours 22 minutes')
    expect(formatDuration(1 * H + 36 * 60_000)).toBe('1 hour 36 minutes')
    expect(formatDuration(90 * 60_000)).toBe('1 hour 30 minutes')
    expect(formatDuration(45 * 60_000)).toBe('45 minutes')
    expect(formatDuration(30_000)).toBe('30 seconds')
    expect(formatDuration(-5000)).toBe('0 seconds')
  })
})

describe('formatElapsedClock()', () => {
  it('matches the spec §5.4 "14:22:07" digital-clock layout', () => {
    expect(formatElapsedClock(14 * H + 22 * 60_000 + 7000)).toBe('14:22:07')
  })

  it('zero-pads single digits', () => {
    expect(formatElapsedClock(H + 5 * 60_000 + 3000)).toBe('01:05:03')
  })

  it('does not wrap hours at 24: it counts elapsed duration, not wall time', () => {
    expect(formatElapsedClock(38 * H)).toBe('38:00:00')
  })

  it('clamps negative durations to zero', () => {
    expect(formatElapsedClock(-5000)).toBe('00:00:00')
  })
})
