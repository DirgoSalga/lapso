import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chart } from './Chart'
import type { CompletedFast } from '../core/types'

const H = 3_600_000

function fast(id: string, hours: number): CompletedFast {
  return { id, startedAt: 0, endedAt: hours * H, goalHours: 16 }
}

describe('<Chart>', () => {
  it('renders nothing for an empty history', () => {
    const { container } = render(<Chart history={[]} goalHours={16} />)
    expect(container.querySelector('.chart')).toBeNull()
  })

  it('renders one bar per fast, capped at the last 30', () => {
    const history = Array.from({ length: 35 }, (_, i) => fast(`f${i}`, 10 + (i % 5)))
    const { container } = render(<Chart history={history} goalHours={16} />)
    expect(container.querySelectorAll('.chart-bar')).toHaveLength(30)
  })

  it('shows the most recent 30 (from the end of history, which is newest-last)', () => {
    const history = Array.from({ length: 32 }, (_, i) => fast(`f${i}`, 10))
    const { container } = render(<Chart history={history} goalHours={16} />)
    const bars = container.querySelectorAll('.chart-bar title')
    expect(bars).toHaveLength(30)
  })

  it('is neutral by construction: every bar shares one class regardless of duration (spec §9.6)', () => {
    const history = [fast('short', 4), fast('long', 30), fast('mid', 16)]
    const { container } = render(<Chart history={history} goalHours={16} />)
    const bars = container.querySelectorAll('rect')
    for (const bar of bars) {
      expect(bar.getAttribute('class')).toBe('chart-bar')
    }
  })

  it('draws a hairline and states the goal in the caption', () => {
    const { container } = render(<Chart history={[fast('a', 10)]} goalHours={16} />)
    expect(container.querySelector('.chart-hairline')).not.toBeNull()
    expect(container.querySelector('.chart-caption')?.textContent).toMatch(/16 hour goal/)
  })

  it('carries an accessible label describing the chart', () => {
    const { container } = render(<Chart history={[fast('a', 10)]} goalHours={16} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toMatch(/16 hour goal/)
  })
})
