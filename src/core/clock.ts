import { dueMilestones } from './milestones'
import type { Phase } from './types'

export const HOUR_MS = 3_600_000
export const INTENSITY_CAP_HOURS = 2
export const ABSURD_HOURS = 168
export const ABSURD_MS = ABSURD_HOURS * HOUR_MS

// spec §9.7: cap goal input at 48h in the UI; above 24h, a plain one-time
// note suggesting the user discuss extended fasting with a doctor. Shared
// by every screen that lets the user set a goal (Timer's idle start,
// Settings' default goal), so the guardrail can't drift between them.
export const MAX_GOAL_HOURS = 48
export const DOCTOR_NOTE_THRESHOLD_HOURS = 24

export function clampGoalHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 1
  return Math.min(MAX_GOAL_HOURS, hours)
}

export interface FastInput {
  startedAt: number
  goalHours: number
  firedMilestones: string[]
  milestonePercents: number[]
  now: number
}

export interface Derived {
  now: number
  startedAt: number
  elapsedMs: number
  goalMs: number
  goalHours: number
  progress: number
  phase: Phase
  hasReachedGoal: boolean
  overtimeMs: number
  overtimeHours: number
  lapIndex: number
  lapProgress: number
  intensity: number
  absurd: boolean
  clockSkew: boolean
  dueMilestones: string[]
}

export function derive(input: FastInput): Derived {
  const { startedAt, goalHours, firedMilestones, milestonePercents, now } = input

  const clockSkew = now < startedAt
  const elapsedMs = Math.max(0, now - startedAt)
  const goalMs = Math.max(0, goalHours) * HOUR_MS
  const progress = goalMs > 0 ? Math.min(elapsedMs / goalMs, 1) : 1

  const hasReachedGoal = elapsedMs >= goalMs
  const phase: Phase = hasReachedGoal ? 'overtime' : 'fasting'

  const overtimeMs = Math.max(0, elapsedMs - goalMs)
  const overtimeHours = overtimeMs / HOUR_MS
  const lapIndex = Math.floor(overtimeHours)
  const lapProgress = overtimeHours - lapIndex
  const intensity = Math.min(overtimeHours, INTENSITY_CAP_HOURS) / INTENSITY_CAP_HOURS

  return {
    now,
    startedAt,
    elapsedMs,
    goalMs,
    goalHours,
    progress,
    phase,
    hasReachedGoal,
    overtimeMs,
    overtimeHours,
    lapIndex,
    lapProgress,
    intensity,
    absurd: elapsedMs > ABSURD_MS,
    clockSkew,
    dueMilestones: dueMilestones(elapsedMs, goalMs, milestonePercents, overtimeHours, firedMilestones),
  }
}

export function pluralHours(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`
}

// The spec's compound-adjective idiom keeps "hour" singular regardless of
// count ("16 hour goal", not "16 hours goal") -- see SPEC.md §6.3's catch-up
// wording and §11's aria-valuetext example ("...of a 16 hour goal").
export function hourGoalLabel(goalHours: number): string {
  return `${goalHours} hour goal`
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, ms)
  const hours = Math.floor(total / HOUR_MS)
  const minutes = Math.floor((total % HOUR_MS) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)

  if (hours > 0) {
    const parts = [`${hours} hour${hours === 1 ? '' : 's'}`]
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
    return parts.join(' ')
  }
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

// The big digital-clock readout (spec §5.4 layout: "14:22:07"), distinct
// from formatDuration()'s prose used for aria-valuetext and milestone copy.
// Hours are not wrapped at 24: this counts elapsed duration, not wall time.
export function formatElapsedClock(ms: number): string {
  const total = Math.max(0, ms)
  const hours = Math.floor(total / HOUR_MS)
  const minutes = Math.floor((total % HOUR_MS) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

// The compact "16h02" form used for the recent-fasts sparkline and history
// list (spec §5.4 layout mockup: "recent 16h02 15h48 16h30 17h11").
export function formatShortDuration(ms: number): string {
  const total = Math.max(0, ms)
  const hours = Math.floor(total / HOUR_MS)
  const minutes = Math.floor((total % HOUR_MS) / 60_000)
  return `${hours}h${minutes.toString().padStart(2, '0')}`
}
