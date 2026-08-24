import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Confetti } from './Confetti'

describe('<Confetti>', () => {
  it('renders a burst of non-interactive, hidden-from-screen-readers pieces', () => {
    const { container } = render(<Confetti />)

    const root = container.querySelector('.confetti')
    expect(root?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0)
  })
})
