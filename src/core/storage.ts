import type { ActiveFast, CompletedFast, Settings } from './types'

export const CURRENT_SCHEMA_VERSION = 1

const KEYS = {
  active: 'fast.active',
  history: 'fast.history',
  settings: 'fast.settings',
  lastSeenNow: 'fast.lastSeenNow',
} as const

export function defaultSettings(): Settings {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    defaultGoalHours: 16,
    milestonePercents: [50, 90],
    notificationsEnabled: false,
    overtimeNotifyHours: 1,
    theme: 'auto',
    reduceMotion: 'auto',
  }
}

// --- change notification, so the React store and the rAF loop both react ---

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    const key = event.key
    if (key === null || key === KEYS.active || key === KEYS.history || key === KEYS.settings) {
      notify()
    }
  })
}

// --- quarantine: corrupt data must never white-screen the app ---

function quarantine(sourceKey: string, raw: string): void {
  try {
    localStorage.setItem(`fast.corrupt.${Date.now()}.${sourceKey}`, raw)
  } catch {
    // best effort; if this throws too there is nothing more we can do
  }
}

// --- validators ---

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string')
}

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'number')
}

function isActiveFast(x: unknown): x is ActiveFast {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.startedAt === 'number' &&
    typeof o.goalHours === 'number' &&
    isStringArray(o.firedMilestones)
  )
}

function isActiveFastOrNull(x: unknown): x is ActiveFast | null {
  return x === null || isActiveFast(x)
}

function isCompletedFast(x: unknown): x is CompletedFast {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.startedAt === 'number' &&
    typeof o.endedAt === 'number' &&
    typeof o.goalHours === 'number' &&
    (o.note === undefined || typeof o.note === 'string')
  )
}

function isCompletedFastArray(x: unknown): x is CompletedFast[] {
  return Array.isArray(x) && x.every(isCompletedFast)
}

const THEMES = new Set(['auto', 'day', 'night'])
const REDUCE_MOTIONS = new Set(['auto', 'always'])

// Keyed on schemaVersion from day one (spec §3.3.2), even though v1 is the
// only version. Unknown or missing fields fall back to defaults rather than
// rejecting the whole object, so a partially-corrupt settings blob recovers
// field by field instead of wholesale.
function migrateSettings(raw: unknown): Settings {
  const fallback = defaultSettings()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback
  const o = raw as Record<string, unknown>
  const schemaVersion = typeof o.schemaVersion === 'number' ? o.schemaVersion : 1

  switch (schemaVersion) {
    case 1:
    default:
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultGoalHours: typeof o.defaultGoalHours === 'number' ? o.defaultGoalHours : fallback.defaultGoalHours,
        milestonePercents: isNumberArray(o.milestonePercents) ? o.milestonePercents : fallback.milestonePercents,
        notificationsEnabled:
          typeof o.notificationsEnabled === 'boolean' ? o.notificationsEnabled : fallback.notificationsEnabled,
        overtimeNotifyHours:
          typeof o.overtimeNotifyHours === 'number' ? o.overtimeNotifyHours : fallback.overtimeNotifyHours,
        theme: typeof o.theme === 'string' && THEMES.has(o.theme) ? (o.theme as Settings['theme']) : fallback.theme,
        reduceMotion:
          typeof o.reduceMotion === 'string' && REDUCE_MOTIONS.has(o.reduceMotion)
            ? (o.reduceMotion as Settings['reduceMotion'])
            : fallback.reduceMotion,
      }
  }
}

// --- reads: every one wrapped in try/catch, JSON-parsed defensively ---

export function loadActive(): ActiveFast | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEYS.active)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    quarantine(KEYS.active, raw)
    return null
  }
  if (!isActiveFastOrNull(parsed)) {
    quarantine(KEYS.active, raw)
    return null
  }
  return parsed
}

export function loadHistory(): CompletedFast[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEYS.history)
  } catch {
    return []
  }
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    quarantine(KEYS.history, raw)
    return []
  }
  if (!isCompletedFastArray(parsed)) {
    quarantine(KEYS.history, raw)
    return []
  }
  return parsed
}

export function loadSettings(): Settings {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEYS.settings)
  } catch {
    return defaultSettings()
  }
  if (raw === null) return defaultSettings()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    quarantine(KEYS.settings, raw)
    return defaultSettings()
  }
  return migrateSettings(parsed)
}

// --- writes: never throw, always notify subscribers ---

export function saveActive(active: ActiveFast | null): void {
  try {
    if (active === null) localStorage.removeItem(KEYS.active)
    else localStorage.setItem(KEYS.active, JSON.stringify(active))
  } catch {
    // best effort; a full disk / quota error must not crash the app
  }
  notify()
}

export function saveHistory(history: CompletedFast[]): void {
  try {
    localStorage.setItem(KEYS.history, JSON.stringify(history))
  } catch {
    // best effort
  }
  notify()
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings))
  } catch {
    // best effort
  }
  notify()
}

// --- fast lifecycle ---

// crypto.randomUUID() only exists in secure contexts (HTTPS, or localhost) --
// it's undefined over a plain-HTTP LAN address, which is a real deployment
// shape for a self-hosted PWA, not just an edge case. Fall back rather than
// let starting a fast throw.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Last resort: not cryptographically random, but only needs to be unique
  // enough to tell one locally-stored fast apart from another.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function startFast(startedAt: number, goalHours: number): ActiveFast {
  const active: ActiveFast = {
    id: generateId(),
    startedAt,
    goalHours,
    firedMilestones: [],
  }
  saveActive(active)
  return active
}

export function endFast(now: number, note?: string): CompletedFast | null {
  const active = loadActive()
  if (active === null) return null

  const completed: CompletedFast = {
    id: active.id,
    startedAt: active.startedAt,
    endedAt: now,
    goalHours: active.goalHours,
    ...(note !== undefined ? { note } : {}),
  }
  saveHistory([...loadHistory(), completed]) // newest last
  saveActive(null)
  return completed
}

export function deleteAll(): void {
  try {
    localStorage.removeItem(KEYS.active)
    localStorage.removeItem(KEYS.history)
    localStorage.removeItem(KEYS.settings)
  } catch {
    // best effort
  }
  notify()
}

// --- export / import: the Safari-eviction backstop (spec §3.3.4) ---

interface ExportPayload {
  schemaVersion: number
  active: ActiveFast | null
  history: CompletedFast[]
  settings: Settings
}

export function exportJson(): string {
  const payload: ExportPayload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    active: loadActive(),
    history: loadHistory(),
    settings: loadSettings(),
  }
  return JSON.stringify(payload, null, 2)
}

export type ImportResult = { ok: true } | { ok: false; reason: string }

export function importJson(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'invalid-shape' }
  }

  const o = parsed as Record<string, unknown>
  const schemaVersion = typeof o.schemaVersion === 'number' ? o.schemaVersion : undefined
  if (schemaVersion !== undefined && schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported-schema-version' }
  }
  if (!isActiveFastOrNull(o.active)) {
    return { ok: false, reason: 'invalid-active' }
  }
  if (!isCompletedFastArray(o.history)) {
    return { ok: false, reason: 'invalid-history' }
  }

  saveActive(o.active)
  saveHistory(o.history)
  saveSettings(migrateSettings(o.settings))
  return { ok: true }
}

// The data-loss backstop's fallback when the full import is refused: the
// history array's shape is far less likely to have changed across schema
// versions than Settings, so a future export can still hand back the fast
// log even when this build doesn't understand its schemaVersion.
export function importHistoryOnly(json: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'invalid-shape' }
  }
  const o = parsed as Record<string, unknown>
  if (!isCompletedFastArray(o.history)) {
    return { ok: false, reason: 'invalid-history' }
  }
  saveHistory(o.history)
  return { ok: true }
}

export interface ImportPreview {
  schemaVersion: number
  fastsCount: number
  sizeBytes: number
  supported: boolean
  hasActive: boolean
}

// A read-only look at a dump before committing it (spec's Settings note:
// "58 fasts, 12.4 MB of history, schema v1 -- replace?").
export function previewImport(json: string): { ok: true; preview: ImportPreview } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'invalid-shape' }
  }
  const o = parsed as Record<string, unknown>
  const schemaVersion = typeof o.schemaVersion === 'number' ? o.schemaVersion : 1
  return {
    ok: true,
    preview: {
      schemaVersion,
      fastsCount: Array.isArray(o.history) ? o.history.length : 0,
      sizeBytes: new TextEncoder().encode(json).length,
      supported: schemaVersion <= CURRENT_SCHEMA_VERSION,
      hasActive: o.active !== null && o.active !== undefined,
    },
  }
}

// --- one-time dismissible notes (UI preference, not part of the versioned
// Settings schema) ---

const EVICTION_NOTICE_KEY = 'fast.noticeDismissed.eviction'

export function isEvictionNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(EVICTION_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissEvictionNotice(): void {
  try {
    localStorage.setItem(EVICTION_NOTICE_KEY, '1')
  } catch {
    // best effort
  }
  notify()
}

// --- system clock change detection (spec §10) ---

export function recordLastSeenNow(now: number): void {
  try {
    localStorage.setItem(KEYS.lastSeenNow, String(now))
  } catch {
    // best effort
  }
}

export function getLastSeenNow(): number | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEYS.lastSeenNow)
  } catch {
    return null
  }
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function hasClockRolledBack(now: number): boolean {
  const lastSeenNow = getLastSeenNow()
  return lastSeenNow !== null && now < lastSeenNow - 60_000
}
