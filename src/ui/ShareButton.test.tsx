import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'
import { defaultSettings, saveSettings } from '../core/storage'
import type { CompletedFast } from '../core/types'

const H = 3_600_000
const PNG_BLOB = new Blob(['fake-png'], { type: 'image/png' })

vi.mock('../core/shareImage', async () => {
  const actual = await vi.importActual<typeof import('../core/shareImage')>('../core/shareImage')
  return {
    ...actual,
    renderFastShareImage: vi.fn(async () => PNG_BLOB),
  }
})

const fast: CompletedFast = { id: 'a', startedAt: 0, endedAt: 12 * H, goalHours: 16 }

beforeEach(() => {
  localStorage.clear()
  saveSettings(defaultSettings())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('<ShareButton> (feature request #7)', () => {
  it('shares a real PNG file via navigator.share when the browser supports it', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })

    render(<ShareButton fast={fast} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'share' }))
    })

    expect(share).toHaveBeenCalledTimes(1)
    const call = share.mock.calls[0]?.[0]
    expect(call?.files?.[0]?.type).toBe('image/png')
    expect(call?.files?.[0]?.name).toBe('lapso-fast-1970-01-01.png')
  })

  it('falls back to downloading the same PNG when file sharing is unsupported, never a link', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined })
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    render(<ShareButton fast={fast} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'share' }))
    })

    expect(createObjectURL).toHaveBeenCalledWith(PNG_BLOB)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('does not fall back to a download when the user just dismisses the share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const share = vi.fn(async () => {
      throw abortError
    })
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })

    render(<ShareButton fast={fast} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'share' }))
    })

    expect(createObjectURL).not.toHaveBeenCalled() // no fallback download fired
  })
})
