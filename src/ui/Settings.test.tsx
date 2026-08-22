import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Settings } from './Settings'
import {
  defaultSettings,
  endFast,
  exportJson,
  loadActive,
  loadHistory,
  loadSettings,
  saveSettings,
  startFast,
} from '../core/storage'

beforeEach(() => {
  localStorage.clear()
  saveSettings(defaultSettings())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('<Settings> default goal (spec §9.7)', () => {
  it('clamps input above 48 and shows the doctor note only above 24h', () => {
    render(<Settings />)
    const input = screen.getByRole('spinbutton', { name: 'Hours' })

    fireEvent.change(input, { target: { value: '20' } })
    expect(screen.queryByText(/discussing extended fasting/)).toBeNull()

    fireEvent.change(input, { target: { value: '49' } })
    expect(loadSettings().defaultGoalHours).toBe(48)
    expect(screen.getByText(/discussing extended fasting/)).toBeTruthy()
  })
})

describe('<Settings> milestone percents', () => {
  it('adds, dedupes, sorts, and rejects out-of-range percents', () => {
    render(<Settings />)
    const addInput = screen.getByPlaceholderText('Add %')

    fireEvent.change(addInput, { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(loadSettings().milestonePercents).toEqual([50, 75, 90])

    fireEvent.change(addInput, { target: { value: '50' } }) // duplicate
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(loadSettings().milestonePercents).toEqual([50, 75, 90])

    fireEvent.change(addInput, { target: { value: '150' } }) // out of range
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(loadSettings().milestonePercents).toEqual([50, 75, 90])
  })

  it('removes a percent via its chip', () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove 50%' }))
    expect(loadSettings().milestonePercents).toEqual([90])
  })
})

describe('<Settings> theme and motion', () => {
  it('switches theme live and persists it', () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }))
    expect(loadSettings().theme).toBe('night')
  })

  it('switches motion live and persists it', () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('radio', { name: 'Always reduce' }))
    expect(loadSettings().reduceMotion).toBe('always')
  })
})

describe('<Settings> notifications (spec §6.2)', () => {
  class FakeNotification {
    static permission: NotificationPermission = 'default'
    static requestPermission = vi.fn<() => Promise<NotificationPermission>>()
  }

  it('requests permission only on the toggle click, and enables only if granted', async () => {
    FakeNotification.permission = 'default'
    FakeNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', FakeNotification)

    render(<Settings />)
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled() // never on load

    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(loadSettings().notificationsEnabled).toBe(true))
    expect(await screen.findByRole('button', { name: 'Disable notifications' })).toBeTruthy()
  })

  it('does not enable when permission comes back denied', async () => {
    FakeNotification.permission = 'default'
    FakeNotification.requestPermission = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('Notification', FakeNotification)

    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))

    await waitFor(() => expect(screen.getByText(/blocked for this site/)).toBeTruthy())
    expect(loadSettings().notificationsEnabled).toBe(false)
  })

  it('shows unsupported when Notification does not exist', () => {
    render(<Settings />)
    expect(screen.getByText(/aren.t supported/i)).toBeTruthy()
  })
})

describe('<Settings> export / import (spec §3.3.4)', () => {
  it('previews a valid file and replaces all data on confirmation', async () => {
    startFast(Date.now() - 3_600_000, 16)
    endFast(Date.now())
    const dump = exportJson()
    localStorage.clear()
    saveSettings(defaultSettings())

    render(<Settings />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([dump], 'lapso-export.json', { type: 'application/json' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText(/1 fast, .* schema v1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace all data' }))

    await waitFor(() => expect(loadHistory()).toHaveLength(1))
  })

  it('offers "import history only" for an unsupported schema version', async () => {
    startFast(Date.now() - 3_600_000, 16)
    endFast(Date.now())
    const dump = JSON.parse(exportJson())
    dump.schemaVersion = 999
    localStorage.clear()
    saveSettings(defaultSettings())

    render(<Settings />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([JSON.stringify(dump)], 'future.json', { type: 'application/json' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'Import history only' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import history only' }))

    await waitFor(() => expect(loadHistory()).toHaveLength(1))
    expect(loadActive()).toBeNull() // active was not part of the history-only import
  })

  it('rejects an unreadable file without throwing', async () => {
    render(<Settings />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['not json'], 'bad.json', { type: 'application/json' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText(/couldn.t be read/)).toBeTruthy()
  })
})

describe('<Settings> delete all data', () => {
  it('requires a second explicit tap before anything is deleted', () => {
    startFast(Date.now() - 3_600_000, 16)
    render(<Settings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }))
    expect(loadActive()).not.toBeNull() // not deleted yet -- first click only reveals confirmation

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete everything' }))
    expect(loadActive()).toBeNull()
    expect(loadSettings()).toEqual(defaultSettings())
  })

  it('cancel leaves everything untouched', () => {
    startFast(Date.now() - 3_600_000, 16)
    render(<Settings />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(loadActive()).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Yes, delete everything' })).toBeNull()
  })
})

describe('<Settings> eviction notice', () => {
  it('shows once and stays dismissed after dismissal', () => {
    const first = render(<Settings />)
    expect(screen.getByText(/clear site data/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText(/clear site data/)).toBeNull()
    first.unmount()

    render(<Settings />)
    expect(screen.queryByText(/clear site data/)).toBeNull()
  })
})
