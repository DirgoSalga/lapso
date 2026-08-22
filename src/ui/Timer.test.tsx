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
    const { container } = render(<Timer />)

    // Digits render as individual fixed-width spans (spec §5.3 tnum
    // fallback), so the digital-clock string is fragmented across nodes.
    expect(container.querySelector('.readout-time')?.textContent).toBe('00:00:30')
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

describe('<Timer> goal swell (spec §5.6)', () => {
  function mockVibrate() {
    const spy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: spy, configurable: true })
    return spy
  }

  it('fires vibrate exactly once on the fasting->overtime crossing, not again later in overtime', () => {
    vi.useFakeTimers()
    try {
      const vibrateSpy = mockVibrate()
      startFast(Date.now() - (16 * HOUR_MS - 500), 16) // 500ms shy of goal
      render(<Timer />)

      act(() => {
        vi.advanceTimersByTime(1500) // crosses the goal within a couple of frames
      })
      expect(vibrateSpy).toHaveBeenCalledTimes(1)
      expect(vibrateSpy).toHaveBeenCalledWith([40, 60, 40])

      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(vibrateSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the swell entirely when settings.reduceMotion is "always"', () => {
    vi.useFakeTimers()
    try {
      const vibrateSpy = mockVibrate()
      saveSettings({ ...defaultSettings(), reduceMotion: 'always' })
      startFast(Date.now() - (16 * HOUR_MS - 500), 16)
      render(<Timer />)

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(vibrateSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
