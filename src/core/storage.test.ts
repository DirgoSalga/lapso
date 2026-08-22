import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  defaultSettings,
  deleteAll,
  dismissEvictionNotice,
  endFast,
  exportJson,
  getLastSeenNow,
  hasClockRolledBack,
  importHistoryOnly,
  importJson,
  isEvictionNoticeDismissed,
  loadActive,
  loadHistory,
  loadSettings,
  previewImport,
  recordLastSeenNow,
  saveSettings,
  startFast,
  subscribe,
} from './storage'

const NOW = 1_700_000_000_000
const H = 3_600_000

beforeEach(() => {
  localStorage.clear()
})

describe('defaults', () => {
  it('returns default settings when nothing is stored', () => {
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('returns null active and empty history when nothing is stored', () => {
    expect(loadActive()).toBeNull()
    expect(loadHistory()).toEqual([])
  })
})

describe('fast lifecycle', () => {
  it('starts a fast and persists it across a fresh load', () => {
    const active = startFast(NOW, 16)
    expect(active.startedAt).toBe(NOW)
    expect(active.goalHours).toBe(16)
    expect(active.firedMilestones).toEqual([])
    expect(loadActive()).toEqual(active)
  })

  it('still generates an id when crypto.randomUUID is unavailable (insecure-context LAN access)', () => {
    const original = crypto.randomUUID
    // @ts-expect-error -- simulating a non-secure context, where this is undefined
    crypto.randomUUID = undefined
    try {
      const active = startFast(NOW, 16)
      expect(active.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      crypto.randomUUID = original
    }
  })

  it('still generates an id when crypto is entirely unavailable', () => {
    const original = globalThis.crypto
    // @ts-expect-error -- simulating an environment with no Web Crypto API at all
    delete globalThis.crypto
    try {
      const active = startFast(NOW, 16)
      expect(active.id.length).toBeGreaterThan(0)
    } finally {
      globalThis.crypto = original
    }
  })

  it('ends a fast: clears active and appends to history', () => {
    startFast(NOW - 16 * H, 16)
    const completed = endFast(NOW)
    expect(completed).not.toBeNull()
    expect(completed?.startedAt).toBe(NOW - 16 * H)
    expect(completed?.endedAt).toBe(NOW)
    expect(completed?.goalHours).toBe(16)
    expect(loadActive()).toBeNull()
    expect(loadHistory()).toEqual([completed])
  })

  it('attaches an optional note on end', () => {
    startFast(NOW - H, 16)
    const completed = endFast(NOW, 'felt fine')
    expect(completed?.note).toBe('felt fine')
  })

  it('does nothing when ending with no active fast', () => {
    expect(endFast(NOW)).toBeNull()
    expect(loadHistory()).toEqual([])
  })

  it('keeps history newest-last across multiple fasts', () => {
    startFast(NOW - 3 * H, 1)
    endFast(NOW - 2 * H)
    startFast(NOW - 1 * H, 1)
    endFast(NOW)

    const history = loadHistory()
    expect(history).toHaveLength(2)
    expect(history[0]?.endedAt).toBe(NOW - 2 * H)
    expect(history[1]?.endedAt).toBe(NOW)
  })
})

describe('deleteAll()', () => {
  it('clears all three keys and resets settings to defaults', () => {
    startFast(NOW, 16)
    saveSettings({ ...defaultSettings(), defaultGoalHours: 20 })

    deleteAll()

    expect(loadActive()).toBeNull()
    expect(loadHistory()).toEqual([])
    expect(loadSettings()).toEqual(defaultSettings())
  })
})

describe('corruption quarantine (spec §3.3.1)', () => {
  it('quarantines unparsable active JSON and falls back to idle', () => {
    localStorage.setItem('fast.active', '{not json')
    expect(loadActive()).toBeNull()

    const quarantined = Object.keys(localStorage).filter((k) => k.startsWith('fast.corrupt.'))
    expect(quarantined).toHaveLength(1)
    expect(localStorage.getItem(quarantined[0] as string)).toBe('{not json')
  })

  it('quarantines a wrong-shaped active object', () => {
    localStorage.setItem('fast.active', JSON.stringify({ foo: 1 }))
    expect(loadActive()).toBeNull()
    expect(Object.keys(localStorage).some((k) => k.startsWith('fast.corrupt.'))).toBe(true)
  })

  it('quarantines corrupt history and falls back to an empty list', () => {
    localStorage.setItem('fast.history', 'not even json{')
    expect(loadHistory()).toEqual([])
    expect(Object.keys(localStorage).some((k) => k.startsWith('fast.corrupt.'))).toBe(true)
  })

  it('quarantines corrupt settings and falls back to defaults', () => {
    localStorage.setItem('fast.settings', '{"schemaVersion":')
    expect(loadSettings()).toEqual(defaultSettings())
    expect(Object.keys(localStorage).some((k) => k.startsWith('fast.corrupt.'))).toBe(true)
  })

  it('never throws even when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => loadActive()).not.toThrow()
    expect(() => loadHistory()).not.toThrow()
    expect(() => loadSettings()).not.toThrow()
    spy.mockRestore()
  })
})

describe('settings migration', () => {
  it('is idempotent for a well-formed v1 object', () => {
    const settings = { ...defaultSettings(), defaultGoalHours: 20, milestonePercents: [40, 80] }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
    saveSettings(loadSettings())
    expect(loadSettings()).toEqual(settings)
  })

  it('fills missing fields with defaults rather than rejecting the object', () => {
    localStorage.setItem('fast.settings', JSON.stringify({ schemaVersion: 1, defaultGoalHours: 20 }))
    const loaded = loadSettings()
    expect(loaded.defaultGoalHours).toBe(20)
    expect(loaded.milestonePercents).toEqual(defaultSettings().milestonePercents)
    expect(loaded.theme).toBe('auto')
  })

  it('falls back entirely for a non-object payload', () => {
    localStorage.setItem('fast.settings', JSON.stringify([1, 2, 3]))
    expect(loadSettings()).toEqual(defaultSettings())
  })
})

describe('export / import round trip', () => {
  it('restores active, history and settings byte-identical after a full clear', () => {
    startFast(NOW - 2 * H, 16)
    saveSettings({ ...defaultSettings(), defaultGoalHours: 20, theme: 'night' })

    const dump = exportJson()
    localStorage.clear()
    expect(loadActive()).toBeNull()

    const result = importJson(dump)
    expect(result).toEqual({ ok: true })
    expect(loadActive()).toEqual({
      id: expect.any(String),
      startedAt: NOW - 2 * H,
      goalHours: 16,
      firedMilestones: [],
    })
    expect(loadSettings().defaultGoalHours).toBe(20)
    expect(loadSettings().theme).toBe('night')
  })

  it('round-trips a completed-fast history', () => {
    startFast(NOW - 20 * H, 16)
    endFast(NOW)
    const before = loadHistory()

    const dump = exportJson()
    localStorage.clear()
    importJson(dump)

    expect(loadHistory()).toEqual(before)
  })

  it('rejects a schema version newer than this build understands', () => {
    const dump = JSON.parse(exportJson())
    dump.schemaVersion = CURRENT_SCHEMA_VERSION + 1
    const result = importJson(JSON.stringify(dump))
    expect(result).toEqual({ ok: false, reason: 'unsupported-schema-version' })
    // and must not have clobbered existing state
    expect(loadActive()).toBeNull()
  })

  it('rejects invalid JSON without throwing', () => {
    expect(importJson('{not json')).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('rejects a malformed active payload', () => {
    const dump = JSON.parse(exportJson())
    dump.active = { garbage: true }
    expect(importJson(JSON.stringify(dump))).toEqual({ ok: false, reason: 'invalid-active' })
  })
})

describe('subscribe()', () => {
  it('notifies listeners on writes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    startFast(NOW, 16)
    expect(listener).toHaveBeenCalledTimes(1)

    endFast(NOW + H) // writes history, then clears active: two notifications
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    startFast(NOW, 16)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('notifies listeners on a cross-tab storage event', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    window.dispatchEvent(new StorageEvent('storage', { key: 'fast.active' }))
    expect(listener).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key' }))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})

describe('clock rollback detection (spec §10)', () => {
  it('is false when nothing has been recorded yet', () => {
    expect(hasClockRolledBack(NOW)).toBe(false)
  })

  it('is false for small forward or backward jitter', () => {
    recordLastSeenNow(NOW)
    expect(hasClockRolledBack(NOW - 30_000)).toBe(false)
    expect(hasClockRolledBack(NOW + H)).toBe(false)
  })

  it('is true once the clock moves back more than a minute', () => {
    recordLastSeenNow(NOW)
    expect(hasClockRolledBack(NOW - 61_000)).toBe(true)
    expect(getLastSeenNow()).toBe(NOW)
  })
})

describe('previewImport()', () => {
  it('summarizes a valid dump without writing anything', () => {
    startFast(NOW - 2 * H, 16)
    endFast(NOW)
    const dump = exportJson()
    localStorage.clear()

    const result = previewImport(dump)
    expect(result).toEqual({
      ok: true,
      preview: { schemaVersion: 1, fastsCount: 1, sizeBytes: expect.any(Number), supported: true, hasActive: false },
    })
    expect(loadHistory()).toEqual([]) // preview must not commit
  })

  it('flags an unsupported (newer) schema version', () => {
    const dump = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, active: null, history: [], settings: {} })
    const result = previewImport(dump)
    expect(result.ok && result.preview.supported).toBe(false)
  })

  it('rejects invalid JSON without throwing', () => {
    expect(previewImport('{not json')).toEqual({ ok: false, reason: 'invalid-json' })
  })
})

describe('importHistoryOnly() (the fallback when a full import is refused)', () => {
  it('imports just the history array regardless of schemaVersion', () => {
    startFast(NOW - 20 * H, 16)
    endFast(NOW)
    const dump = JSON.parse(exportJson())
    dump.schemaVersion = CURRENT_SCHEMA_VERSION + 1 // would be refused by importJson()
    localStorage.clear()

    expect(importJson(JSON.stringify(dump))).toEqual({ ok: false, reason: 'unsupported-schema-version' })
    expect(importHistoryOnly(JSON.stringify(dump))).toEqual({ ok: true })
    expect(loadHistory()).toHaveLength(1)
    expect(loadActive()).toBeNull() // only history is touched
  })

  it('rejects a malformed history array', () => {
    expect(importHistoryOnly(JSON.stringify({ history: 'nope' }))).toEqual({ ok: false, reason: 'invalid-history' })
  })
})

describe('eviction notice dismissal', () => {
  it('is not dismissed by default, and stays dismissed once set', () => {
    expect(isEvictionNoticeDismissed()).toBe(false)
    dismissEvictionNotice()
    expect(isEvictionNoticeDismissed()).toBe(true)
  })

  it('notifies subscribers on dismissal', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    dismissEvictionNotice()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
