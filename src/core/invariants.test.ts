import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = 'invariants.test.ts'

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      yield* walk(path)
    } else if (entry !== SELF && /\.(ts|tsx|js|jsx|css)$/.test(entry)) {
      yield path
    }
  }
}

function collectSources(): Map<string, string> {
  const sources = new Map<string, string>()
  for (const file of walk(srcRoot)) {
    sources.set(file, readFileSync(file, 'utf8'))
  }
  return sources
}

const persistedElapsed = /localStorage\s*\.\s*setItem\s*\((?:[^()]|\([^()]*\))*\belapsed/i
const accumulatingCounter = /elapsed\w*\s*\+=/
const confirmDialog = /\bwindow\s*\.\s*confirm\s*\(|(?<![\w.])confirm\s*\(/
const directNotificationConstructor = /new\s+Notification\s*\(/

describe('invariant: no persisted elapsed time (spec §1)', () => {
  it('never writes a stored elapsed duration', () => {
    const offenders: string[] = []
    for (const [file, source] of collectSources()) {
      if (persistedElapsed.test(source) || accumulatingCounter.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('invariant: no confirmation dialogs (spec §9.2)', () => {
  it('never calls confirm()', () => {
    const offenders: string[] = []
    for (const [file, source] of collectSources()) {
      if (confirmDialog.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('invariant: notifications only ever dispatch through the service worker (spec §6.2)', () => {
  it('never calls `new Notification()` directly outside of tests', () => {
    const offenders: string[] = []
    for (const [file, source] of collectSources()) {
      if (/\.test\.tsx?$/.test(file)) continue // tests reference the pattern to assert against it
      if (directNotificationConstructor.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})
