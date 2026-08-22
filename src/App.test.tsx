import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { defaultSettings, saveSettings } from './core/storage'

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
    expect(screen.getByText('Settings are coming soon.')).toBeTruthy()
  })

  it('falls back to the timer for an unknown hash', () => {
    window.location.hash = '#/nonsense'
    render(<App />)
    expect(screen.getByRole('button', { name: 'Start fast' })).toBeTruthy()
  })
})
