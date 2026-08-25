import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { History } from './History'
import { defaultSettings, saveHistory, saveSettings } from '../core/storage'
import type { CompletedFast } from '../core/types'

const H = 3_600_000

function fast(id: string, startedAt: number, hours: number, note?: string): CompletedFast {
  return { id, startedAt, endedAt: startedAt + hours * H, goalHours: 16, ...(note ? { note } : {}) }
}

beforeEach(() => {
  localStorage.clear()
  saveSettings(defaultSettings())
})

afterEach(() => {
  cleanup()
})

describe('<History>', () => {
  it('shows a brief empty state with no "you have not fasted" framing (spec §9.5)', () => {
    render(<History />)
    const empty = screen.getByText(/No fasts recorded yet\./)
    expect(empty).toBeTruthy()
    expect(screen.queryByText(/day/i)).toBeNull()
  })

  it('lists fasts newest-first even though storage keeps them newest-last', () => {
    saveHistory([fast('older', 0, 12), fast('newer', 100 * H, 14)])
    const { container } = render(<History />)

    const rows = container.querySelectorAll('.history-row-summary')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('14 hours')
    expect(rows[1]?.textContent).toContain('12 hours')
  })

  it('is neutral by construction: no conditional styling and no verdict copy per row (spec §9.6)', () => {
    saveHistory([fast('short', 0, 2), fast('long', 100 * H, 40)])
    const { container } = render(<History />)

    const rows = container.querySelectorAll('.history-row-summary')
    const classNames = new Set([...rows].map((r) => r.className))
    expect(classNames.size).toBe(1) // one shared class regardless of duration
    expect(container.textContent).not.toMatch(/streak|record|best|missed|failed/i)
  })

  it('expands a row on click to show start/end times and an optional note', () => {
    saveHistory([fast('a', 0, 12, 'felt good')])
    render(<History />)

    expect(screen.queryByText('felt good')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('felt good')).toBeTruthy()
  })

  it('rows are reachable and activatable by keyboard', () => {
    saveHistory([fast('a', 0, 12)])
    render(<History />)

    const row = screen.getByRole('button')
    row.focus()
    expect(document.activeElement).toBe(row)
  })

  it('renders the chart when there is history', () => {
    saveHistory([fast('a', 0, 12)])
    const { container } = render(<History />)
    expect(container.querySelector('.chart')).not.toBeNull()
  })

  it('has a back link to the timer', () => {
    render(<History />)
    const back = screen.getByRole('link', { name: /back/i })
    expect(back.getAttribute('href')).toBe('#/')
  })
})

describe('<History> fast card (feature request #6)', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('each row offers a "card" link alongside its own expand toggle', () => {
    saveHistory([fast('a', 0, 12)])
    render(<History />)

    expect(screen.getByRole('button')).toBeTruthy() // the expand toggle, unaffected
    const cardLink = screen.getByRole('link', { name: 'card' })
    expect(cardLink.getAttribute('href')).toBe('#/history/a')
  })

  it('shows the card directly on a #/history/<id> direct load, with ring/duration/goal/range', () => {
    saveHistory([fast('a', 0, 12, 'felt good')])
    window.location.hash = '#/history/a'
    const { container } = render(<History />)

    expect(container.querySelector('.history-ring')).not.toBeNull()
    expect(container.querySelector('.history-readout-time')?.textContent).toBe('12:00:00')
    expect(screen.getByText('16 hour goal')).toBeTruthy()
    expect(screen.getByText('felt good')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /back to history/i })?.getAttribute('href')).toBe('#/history')
  })

  it('switches from the list to the card on a hashchange (clicking a bar or row link navigates the same way)', () => {
    saveHistory([fast('a', 0, 12)])
    const { container } = render(<History />)
    expect(container.querySelector('.history-ring')).toBeNull()

    const cardLink = screen.getByRole('link', { name: 'card' })
    expect(cardLink.getAttribute('href')).toBe('#/history/a') // what the click below would navigate to

    act(() => {
      window.location.hash = '#/history/a'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(container.querySelector('.history-ring')).not.toBeNull()
    expect(container.querySelector('.history-list')).toBeNull()
  })

  it('falls back to the list for an id that does not resolve to any fast', () => {
    saveHistory([fast('a', 0, 12)])
    window.location.hash = '#/history/does-not-exist'
    const { container } = render(<History />)

    expect(container.querySelector('.history-ring')).toBeNull()
    expect(container.querySelector('.history-list')).not.toBeNull()
  })
})
