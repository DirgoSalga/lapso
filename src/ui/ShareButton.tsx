import { useState } from 'react'
import { resolveTheme } from '../core/color'
import { canShareFiles, isShareSupported, renderFastShareImage, shareFileName } from '../core/shareImage'
import { loadSettings } from '../core/storage'
import type { CompletedFast } from '../core/types'

interface ShareButtonProps {
  fast: CompletedFast
}

// Resolves 'day'/'night' at click time rather than subscribing to it --
// this only needs to be correct at the moment of sharing, not reactive,
// so there's no need for the useMediaQueryMatches hook Timer.tsx uses for
// its continuously-rendered theme.
function resolveCurrentTheme() {
  const prefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  return resolveTheme(loadSettings().theme, prefersDark)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Shares a fast's card as a real PNG file (feature request #7, ISSUES.md)
// via the OS share sheet -- not a link, since lapso.cloud.dirgosalga.com
// is only reachable inside Diego's mesh and would be dead for anyone
// outside it. Falls back to downloading the same PNG when
// navigator.share/canShare with files isn't available (desktop browsers,
// older Safari, etc.) -- still a real picture file either way, just
// without the native share sheet.
export function ShareButton({ fast }: ShareButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleShare = async () => {
    if (busy) return
    setBusy(true)
    try {
      const blob = await renderFastShareImage(fast, resolveCurrentTheme())
      const filename = shareFileName(fast.startedAt)
      const file = new File([blob], filename, { type: 'image/png' })

      if (isShareSupported() && canShareFiles(file)) {
        try {
          await navigator.share({ files: [file], title: 'Lapso' })
          return
        } catch (err) {
          // AbortError: the user dismissed the share sheet -- not a
          // failure, and definitely not something to fall back from.
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }
      downloadBlob(blob, filename)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="eyebrow-link eyebrow-button" onClick={handleShare} disabled={busy}>
      {busy ? 'sharing…' : 'share'}
    </button>
  )
}
