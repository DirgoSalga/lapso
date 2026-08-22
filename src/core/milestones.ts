import { formatDuration, hourGoalLabel, HOUR_MS, pluralHours } from './clock'

export const MAX_OVERTIME_MILESTONES = 3

export function milestoneKeys(
  elapsedMs: number,
  goalMs: number,
  percents: number[],
  overtimeHours: number,
): string[] {
  const keys: string[] = []
  if (goalMs > 0) {
    for (const pct of percents) {
      if (pct >= 1 && pct <= 99 && elapsedMs >= (goalMs * pct) / 100) {
        keys.push(`p${pct}`)
      }
    }
  }
  if (elapsedMs >= goalMs) {
    keys.push('goal')
  }
  if (overtimeHours > 0) {
    for (let i = 1; i <= MAX_OVERTIME_MILESTONES; i++) {
      if (overtimeHours >= i) {
        keys.push(`ot${i}`)
      }
    }
  }
  return keys
}

export function dueMilestones(
  elapsedMs: number,
  goalMs: number,
  percents: number[],
  overtimeHours: number,
  firedMilestones: string[],
): string[] {
  const fired = new Set(firedMilestones)
  const seen = new Set<string>()
  return milestoneKeys(elapsedMs, goalMs, percents, overtimeHours).filter((key) => {
    if (fired.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export interface MilestoneContext {
  key: string
  goalHours: number
  goalMs: number
  elapsedMs: number
}

// spec §6.4 copy, verbatim for the two default percents (50, 90); the
// 90%-example's phrasing ("N to your goal") is actually generic and
// covers any configured percent other than the halfway point.
export function milestoneCopy({ key, goalHours, goalMs, elapsedMs }: MilestoneContext): string {
  if (key === 'goal') {
    return `${pluralHours(goalHours)} reached.`
  }
  if (key.startsWith('ot')) {
    return `${pluralHours(Math.round(elapsedMs / HOUR_MS))}. Still going.`
  }
  if (key.startsWith('p')) {
    const pct = Number(key.slice(1))
    if (pct === 50) {
      return `Half way. ${formatDuration(elapsedMs)} in.`
    }
    return `${formatDuration(Math.max(0, goalMs - elapsedMs))} to your goal.`
  }
  return ''
}

// spec §6.3: the one consolidated catch-up card, phrased retrospectively
// ("you passed X, Y ago") rather than the live, present-tense copy above.
export function catchUpCopy({ key, goalHours, goalMs, elapsedMs }: MilestoneContext): string {
  if (key === 'goal' || key.startsWith('ot')) {
    const ago = formatDuration(Math.max(0, elapsedMs - goalMs))
    const stillGoing = key.startsWith('ot') ? ' Still going.' : ''
    return `You passed your ${hourGoalLabel(goalHours)} ${ago} ago.${stillGoing}`
  }
  if (key.startsWith('p')) {
    const pct = Number(key.slice(1))
    const thresholdMs = (goalMs * pct) / 100
    const ago = formatDuration(Math.max(0, elapsedMs - thresholdMs))
    return `You passed the ${pct} percent milestone ${ago} ago.`
  }
  return ''
}

// Picks which of several simultaneously-due milestones headlines a single
// consolidated catch-up card (spec §6.3: one card, not a burst). Keys come
// out of milestoneKeys()/dueMilestones() in chronological order already,
// so the most-advanced one crossed is simply the last.
export function headlineMilestone(dueKeys: string[]): string | undefined {
  return dueKeys[dueKeys.length - 1]
}
