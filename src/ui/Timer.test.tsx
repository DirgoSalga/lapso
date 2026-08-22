import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timer } from './Timer'
import { defaultSettings, endFast, loadHistory, saveSettings, startFast } from '../core/storage'
import { HOUR_MS } from '../core/clock'

beforeEach(() => {
  localStorage.clear()
  saveSettings(defaultSettings())
})

afterEach(() => {
  cleanup()
})

describe('<Timer> idle state', () => {
  it('shows Start fast and a goal input defaulting to settings.defaultGoalHours', () => {
    saveSettings({ ...defaultSettings(), defaultGoalHours: 18 })
    render(<Timer />)
    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('18')
  })

  it('starting a fast shows a 5s undo toast that removes it without a history entry', () => {
    vi.useFakeTimers()
    try {
      render(<Timer />)
      fireEvent.click(screen.getByRole('button', { name: 'Start fast' }))

      expect(screen.getByText('Fast started.')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

      expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
      expect(loadHistory()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('dismisses the undo toast on its own after 5 seconds without removing the fast', () => {
    vi.useFakeTimers()
    try {
      render(<Timer />)
      fireEvent.click(screen.getByRole('button', { name: 'Start fast' }))
      expect(screen.getByText('Fast started.')).toBeTruthy()

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.queryByText('Fast started.')).toBeNull()
      expect(screen.getByRole('button', { name: 'End fast' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('<Timer> active fast', () => {
  it('always shows an enabled, focusable End fast button with no confirm dialog', () => {
    startFast(Date.now() - HOUR_MS, 16)
    render(<Timer />)

    const endButton = screen.getByRole('button', { name: 'End fast' })
    expect(endButton).not.toBeDisabled()
    endButton.focus()
    expect(document.activeElement).toBe(endButton)
  })

  it('ending a fast returns to idle without a page reload and records history', () => {
    startFast(Date.now() - 2 * HOUR_MS, 16)
    render(<Timer />)

    fireEvent.click(screen.getByRole('button', { name: 'End fast' }))

    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
    expect(loadHistory()).toHaveLength(1)
  })

  it('continues the readout from elapsed time on a fresh mount, not from zero (spec §14)', () => {
    startFast(Date.now() - 30_000, 16)
    render(<Timer />)

    expect(screen.getByText('30 seconds')).toBeTruthy()
  })

  it('reflects another tab ending the fast without a reload (spec §14 two tabs)', () => {
    startFast(Date.now() - HOUR_MS, 16)
    render(<Timer />)
    expect(screen.getByRole('button', { name: 'End fast' })).toBeTruthy()

    // Simulates the write a second tab would make; this tab's storage
    // subscription (not a page reload) is what should pick it up.
    act(() => {
      endFast(Date.now())
    })

    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
  })
})
