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
