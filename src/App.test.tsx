import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { defaultSettings, loadSettings, saveSettings } from './core/storage'

beforeEach(() => {
  localStorage.clear()
  saveSettings(defaultSettings())
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
})

describe('<App> routing (spec §8)', () => {
  it('renders the timer at #/', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
  })

  it('direct-loads #/history without going through the timer first', () => {
    window.location.hash = '#/history'
    render(<App />)
    expect(screen.getByRole('link', { name: /back/i })).toBeTruthy()
    expect(screen.getByText(/No fasts recorded yet\./)).toBeTruthy()
  })

  it('direct-loads #/settings', () => {
    window.location.hash = '#/settings'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Default goal' })).toBeTruthy()
  })

  it('falls back to the timer for an unknown hash', () => {
    window.location.hash = '#/nonsense'
    render(<App />)
    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
  })
})

describe('<App> background (feature request #4/#6 follow-up: global backdrop)', () => {
  it('renders the dot backdrop on every route, not just the active-fast screen', () => {
    for (const hash of ['', '#/history', '#/settings']) {
      window.location.hash = hash
      const { container, unmount } = render(<App />)
      expect(container.querySelector('.fast-backdrop')).not.toBeNull()
      unmount()
    }
  })
})

describe('<App> theme application (spec §5.2/Gate 7: "theme switches live")', () => {
  it('applies data-theme immediately from the Settings screen, not just while Timer is mounted', () => {
    window.location.hash = '#/settings'
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: 'Night' }))

    expect(loadSettings().theme).toBe('night')
    expect(document.documentElement.dataset.theme).toBe('night')
  })
})
