import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timer } from './Timer'
import { defaultSettings, endFast, loadActive, loadHistory, saveSettings, startFast } from '../core/storage'
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

  it('shows the projected completion time, live as the goal changes (feature: completion time)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T08:00:00'))
      saveSettings({ ...defaultSettings(), defaultGoalHours: 16 })
      render(<Timer />)
      expect(screen.getByText('Done around 00:00')).toBeTruthy()

      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '18' } })
      expect(screen.getByText('Done around 02:00')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
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

  it('writes --fast-card-glow tracking the ring colour while active, and clears it when the fast ends (feature: card glow)', () => {
    startFast(Date.now() - 8 * HOUR_MS, 16) // halfway to goal
    render(<Timer />)

    const glow = document.documentElement.style.getPropertyValue('--fast-card-glow')
    expect(glow).toMatch(/^oklch\(/)

    fireEvent.click(screen.getByRole('button', { name: 'End fast' }))
    expect(document.documentElement.style.getPropertyValue('--fast-card-glow')).toBe('')
  })

  it('continues the readout from elapsed time on a fresh mount, not from zero (spec §14)', () => {
    startFast(Date.now() - 30_000, 16)
    const { container } = render(<Timer />)

    // Digits render as individual fixed-width spans (spec §5.3 tnum
    // fallback), so the digital-clock string is fragmented across nodes.
    expect(container.querySelector('.readout-time')?.textContent).toBe('00:00:30')
  })

  it('shows the projected completion time next to "fasting since" (feature: completion time)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T08:00:00'))
      startFast(Date.now(), 16)
      render(<Timer />)

      expect(screen.getByText(/fasting since 08:00/)).toBeTruthy()
      expect(screen.getByText(/done 00:00/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tapping the readout toggles it between elapsed and remaining time, and back (feature: remaining time)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T08:00:00'))
      startFast(Date.now() - 2 * HOUR_MS, 16)
      const { container } = render(<Timer />)

      expect(container.querySelector('.readout-time')?.textContent).toBe('02:00:00')

      fireEvent.click(screen.getByRole('button', { name: 'Showing elapsed time. Tap to show time remaining.' }))
      expect(container.querySelector('.readout-time')?.textContent).toBe('14:00:00')

      fireEvent.click(screen.getByRole('button', { name: 'Showing time remaining. Tap to show elapsed time.' }))
      expect(container.querySelector('.readout-time')?.textContent).toBe('02:00:00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the readout to elapsed time when a new fast starts', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T08:00:00'))
      startFast(Date.now() - 2 * HOUR_MS, 16)
      const { container } = render(<Timer />)

      fireEvent.click(screen.getByRole('button', { name: 'Showing elapsed time. Tap to show time remaining.' }))
      expect(container.querySelector('.readout-time')?.textContent).toBe('14:00:00')

      fireEvent.click(screen.getByRole('button', { name: 'End fast' }))
      fireEvent.click(screen.getByRole('button', { name: 'Start fast' }))

      expect(container.querySelector('.readout-time')?.textContent).toBe('00:00:00')
      expect(screen.getByRole('button', { name: 'Showing elapsed time. Tap to show time remaining.' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
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

  it('shows confetti once the goal is crossed, keeps it falling through overtime, and clears it when the fast ends (feature: goal confetti)', () => {
    vi.useFakeTimers()
    try {
      startFast(Date.now() - (16 * HOUR_MS - 500), 16)
      const { container } = render(<Timer />)
      expect(container.querySelector('.confetti')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(1500) // crosses the goal within a couple of frames
      })
      expect(container.querySelector('.confetti')).toBeTruthy()

      act(() => {
        vi.advanceTimersByTime(60_000) // well into overtime -- still falling, no auto-clear
      })
      expect(container.querySelector('.confetti')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'End fast' }))
      expect(container.querySelector('.confetti')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows confetti immediately on mount if the fast is already in overtime (e.g. reopened mid-overtime)', () => {
    startFast(Date.now() - 17 * HOUR_MS, 16) // an hour past goal already
    const { container } = render(<Timer />)

    expect(container.querySelector('.confetti')).toBeTruthy()
  })

  it('skips confetti entirely when settings.reduceMotion is "always"', () => {
    vi.useFakeTimers()
    try {
      saveSettings({ ...defaultSettings(), reduceMotion: 'always' })
      startFast(Date.now() - (16 * HOUR_MS - 500), 16)
      const { container } = render(<Timer />)

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(container.querySelector('.confetti')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('<Timer> milestones (spec §6)', () => {
  it('shows one consolidated catch-up card for a milestone already overdue at launch, and marks it fired', () => {
    startFast(Date.now() - (16 * HOUR_MS + 40 * 60_000), 16) // 40 minutes past goal
    render(<Timer />)

    expect(screen.getByText('You passed your 16 hour goal 40 minutes ago.')).toBeTruthy()
    expect(loadActive()?.firedMilestones).toEqual(['p50', 'p90', 'goal'])
  })

  it('does not re-show the catch-up card on a later refresh, since it is already fired', () => {
    startFast(Date.now() - (16 * HOUR_MS + 40 * 60_000), 16)
    const first = render(<Timer />)
    expect(screen.getByText('You passed your 16 hour goal 40 minutes ago.')).toBeTruthy()
    first.unmount()

    render(<Timer />)
    expect(screen.queryByText(/You passed your 16 hour goal/)).toBeNull()
  })

  it('dismisses the catch-up card on click without un-firing the milestone', () => {
    startFast(Date.now() - (16 * HOUR_MS + 40 * 60_000), 16)
    render(<Timer />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/You passed your 16 hour goal/)).toBeNull()
    expect(loadActive()?.firedMilestones).toEqual(['p50', 'p90', 'goal'])
  })

  it('fires a milestone exactly once across three consecutive refreshes (spec §14)', () => {
    startFast(Date.now() - 9 * HOUR_MS, 16) // past the 50% mark, well short of goal

    const r1 = render(<Timer />)
    expect(loadActive()?.firedMilestones).toEqual(['p50'])
    r1.unmount()

    const r2 = render(<Timer />)
    expect(loadActive()?.firedMilestones).toEqual(['p50'])
    r2.unmount()

    const r3 = render(<Timer />)
    expect(loadActive()?.firedMilestones).toEqual(['p50'])
    r3.unmount()
  })

  it('fires the live in-app toast exactly once on crossing a milestone while mounted', () => {
    vi.useFakeTimers()
    try {
      startFast(Date.now() - (8 * HOUR_MS - 500), 16) // 500ms shy of the 50% mark
      render(<Timer />)
      expect(screen.queryByText('Half way. 8 hours in.')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(1500) // crosses 50% within a couple of frames
      })

      expect(screen.getByText('Half way. 8 hours in.')).toBeTruthy()
      expect(loadActive()?.firedMilestones).toEqual(['p50'])

      act(() => {
        vi.advanceTimersByTime(2000)
      })
      // still just the one toast instance -- not re-fired on a later tick
      expect(loadActive()?.firedMilestones).toEqual(['p50'])
    } finally {
      vi.useRealTimers()
    }
  })
})
