export type Phase = 'idle' | 'fasting' | 'goal-reached' | 'overtime'

export interface ActiveFast {
  id: string
  startedAt: number
  goalHours: number
  firedMilestones: string[]
}

export interface CompletedFast {
  id: string
  startedAt: number
  endedAt: number
  goalHours: number
  note?: string
}

export interface Settings {
  schemaVersion: number
  defaultGoalHours: number
  milestonePercents: number[]
  notificationsEnabled: boolean
  overtimeNotifyHours: number
  theme: 'auto' | 'day' | 'night'
  reduceMotion: 'auto' | 'always'
}
