import { act } from 'react'
import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ring, RING_CIRCUMFERENCE, RING_OVERTIME_CIRCUMFERENCE } from './Ring'
import type { RingHandle } from './Ring'

describe('<Ring>', () => {
  it('renders the accessible progressbar shell with the spec §5.5 geometry', () => {
    const { container } = render(<Ring milestonePercents={[50, 90]} />)
    const svg = container.querySelector('svg.ring')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('role')).toBe('progressbar')
    expect(svg?.getAttribute('aria-valuemin')).toBe('0')
    expect(svg?.getAttribute('aria-valuemax')).toBe('100')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 240 240')

    const track = container.querySelector('.ring-track')
    expect(track?.getAttribute('r')).toBe('100')
    expect(track?.getAttribute('stroke-width')).toBe('12')

    const overtime = container.querySelector('.ring-overtime')
    expect(overtime?.getAttribute('r')).toBe('116')
    expect(overtime?.getAttribute('stroke-width')).toBe('4')
  })

  it('places milestone ticks at angle = 360*pct/100 - 90 and starts them unpassed', () => {
    const { container } = render(<Ring milestonePercents={[50, 90]} />)
    const ticks = container.querySelectorAll('.ring-tick')
    expect(ticks).toHaveLength(2)
    expect(ticks[0]?.getAttribute('transform')).toBe('rotate(90 120 120)') // 360*50/100 - 90
    expect(ticks[1]?.getAttribute('transform')).toBe('rotate(234 120 120)') // 360*90/100 - 90
    expect(ticks[0]?.getAttribute('data-passed')).toBe('false')
  })

  it('writeFrame() sets stroke-dashoffset from progress, never through React state', () => {
    const ref = createRef<RingHandle>()
    const { container } = render(<Ring ref={ref} milestonePercents={[50, 90]} />)

    act(() => {
      ref.current?.writeFrame({ progress: 0.5, lapProgress: 0, intensity: 0 })
    })

    const arc = container.querySelector('.ring-progress') as SVGCircleElement
    expect(arc.style.strokeDashoffset).toBe(String(RING_CIRCUMFERENCE * 0.5))
  })

  it('writeFrame() drives the overtime arc from lapProgress independently of progress', () => {
    const ref = createRef<RingHandle>()
    const { container } = render(<Ring ref={ref} milestonePercents={[]} />)

    act(() => {
      ref.current?.writeFrame({ progress: 1, lapProgress: 0.25, intensity: 0.5 })
    })

    const overtimeArc = container.querySelector('.ring-overtime') as SVGCircleElement
    expect(overtimeArc.style.strokeDashoffset).toBe(String(RING_OVERTIME_CIRCUMFERENCE * 0.75))

    const glow = container.querySelector('.ring-glow') as SVGCircleElement
    expect(glow.style.opacity).toBe('0.5')
  })

  it('writeReadout() sets aria-valuenow/aria-valuetext and flips ticks once passed', () => {
    const ref = createRef<RingHandle>()
    const { container } = render(<Ring ref={ref} milestonePercents={[50, 90]} />)

    act(() => {
      ref.current?.writeReadout({
        ariaValueNow: 60,
        ariaValueText: '9 hours 36 minutes of a 16 hour goal',
        progressPercent: 60,
        lapIndex: 0,
      })
    })

    const svg = container.querySelector('svg.ring')
    expect(svg?.getAttribute('aria-valuenow')).toBe('60')
    expect(svg?.getAttribute('aria-valuetext')).toBe('9 hours 36 minutes of a 16 hour goal')

    const ticks = container.querySelectorAll('.ring-tick')
    expect(ticks[0]?.getAttribute('data-passed')).toBe('true') // 50 <= 60
    expect(ticks[1]?.getAttribute('data-passed')).toBe('false') // 90 > 60
  })

  it('writeReadout() grows persistent lap dots to match lapIndex, one dot per completed overtime hour', () => {
    const ref = createRef<RingHandle>()
    const { container } = render(<Ring ref={ref} milestonePercents={[]} />)

    act(() => {
      ref.current?.writeReadout({ ariaValueNow: 100, ariaValueText: 'x', progressPercent: 100, lapIndex: 3 })
    })
    expect(container.querySelectorAll('.ring-lap-dot')).toHaveLength(3)

    act(() => {
      ref.current?.writeReadout({ ariaValueNow: 100, ariaValueText: 'x', progressPercent: 100, lapIndex: 3 })
    })
    expect(container.querySelectorAll('.ring-lap-dot')).toHaveLength(3)
  })

  it('triggerGoalSwell() flashes the arc to a solid ember and reverts after 900ms (spec §5.6)', () => {
    vi.useFakeTimers()
    try {
      const ref = createRef<RingHandle>()
      const { container } = render(<Ring ref={ref} milestonePercents={[]} />)

      act(() => {
        ref.current?.writeFrame({ progress: 1, lapProgress: 0, intensity: 1 })
        ref.current?.triggerGoalSwell()
      })

      const [start, end] = container.querySelectorAll('#ring-gradient stop')
      expect(start?.getAttribute('stop-color')).toBe(end?.getAttribute('stop-color')) // solid, no gloss split
      expect(start?.classList.contains('ring-swell-transition')).toBe(true)
      expect(container.querySelector('.ring-glow')?.classList.contains('ring-swell-glow')).toBe(true)

      act(() => {
        vi.advanceTimersByTime(900)
      })

      expect(start?.classList.contains('ring-swell-transition')).toBe(false)
      expect(container.querySelector('.ring-glow')?.classList.contains('ring-swell-glow')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
