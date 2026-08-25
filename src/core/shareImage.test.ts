import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareFiles, isShareSupported, shareFileName } from './shareImage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isShareSupported()', () => {
  it('is true when navigator.share exists', () => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn() })
    expect(isShareSupported()).toBe(true)
  })

  it('is false when navigator.share is missing (feature: share fast card)', () => {
    const { share: _share, ...rest } = navigator as Navigator & { share?: unknown }
    vi.stubGlobal('navigator', rest)
    expect(isShareSupported()).toBe(false)
  })
})

describe('canShareFiles()', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' })

  it('defers to navigator.canShare({ files })', () => {
    const canShare = vi.fn(() => true)
    vi.stubGlobal('navigator', { ...navigator, canShare })
    expect(canShareFiles(file)).toBe(true)
    expect(canShare).toHaveBeenCalledWith({ files: [file] })
  })

  it('is false when navigator.canShare is missing entirely', () => {
    const { canShare: _canShare, ...rest } = navigator as Navigator & { canShare?: unknown }
    vi.stubGlobal('navigator', rest)
    expect(canShareFiles(file)).toBe(false)
  })

  it('is false when canShare itself says no (e.g. file type unsupported)', () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => false })
    expect(canShareFiles(file)).toBe(false)
  })
})

describe('shareFileName()', () => {
  it('formats as lapso-fast-YYYY-MM-DD.png, zero-padded', () => {
    expect(shareFileName(new Date('2026-01-05T08:00:00').getTime())).toBe('lapso-fast-2026-01-05.png')
  })
})
