import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRoute, useSelectedHistoryId } from './router'

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

  it('resolves #/history/<id> to the history route too (feature: history cards)', () => {
    setHash('#/history/abc-123')
    expect(renderHook(() => useRoute()).result.current).toBe('history')
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

describe('useSelectedHistoryId() (feature: history cards)', () => {
  it('is null on the plain #/history route', () => {
    setHash('#/history')
    expect(renderHook(() => useSelectedHistoryId()).result.current).toBeNull()
  })

  it('reads the id from #/history/<id> on a direct load', () => {
    setHash('#/history/abc-123')
    expect(renderHook(() => useSelectedHistoryId()).result.current).toBe('abc-123')
  })

  it('decodes a URI-encoded id', () => {
    setHash(`#/history/${encodeURIComponent('weird id/with slash')}`)
    expect(renderHook(() => useSelectedHistoryId()).result.current).toBe('weird id/with slash')
  })

  it('follows hashchange, and clears back to null (browser back to the list)', () => {
    setHash('#/history/abc-123')
    const { result } = renderHook(() => useSelectedHistoryId())
    expect(result.current).toBe('abc-123')

    act(() => {
      setHash('#/history')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current).toBeNull()
  })
})
