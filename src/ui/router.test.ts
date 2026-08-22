import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRoute } from './router'

function setHash(hash: string) {
  window.location.hash = hash
}

afterEach(() => {
  window.location.hash = ''
})

describe('useRoute()', () => {
  it('resolves #/ to timer', () => {
    setHash('')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe('timer')
  })

  it('resolves #/history and #/settings', () => {
    setHash('#/history')
    expect(renderHook(() => useRoute()).result.current).toBe('history')

    setHash('#/settings')
    expect(renderHook(() => useRoute()).result.current).toBe('settings')
  })

  it('falls back to timer for an unknown hash (spec §8)', () => {
    setHash('#/nonsense')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe('timer')
  })

  it('reads the current hash on a direct load, not just on change', () => {
    setHash('#/history')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe('history')
  })

  it('follows hashchange events (back/forward navigation)', () => {
    setHash('')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe('timer')

    act(() => {
      setHash('#/history')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current).toBe('history')

    act(() => {
      setHash('')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current).toBe('timer')
  })
})
