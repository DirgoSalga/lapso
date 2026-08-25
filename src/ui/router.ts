import { useEffect, useState } from 'react'

export type Route = 'timer' | 'history' | 'settings'

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  // #/history/<id> (feature request #6, ISSUES.md) is still the history
  // route at this level -- History.tsx reads the id itself, via
  // useSelectedHistoryId() below.
  if (path === '/history' || path.startsWith('/history/')) return 'history'
  if (path === '/settings') return 'settings'
  return 'timer' // unknown hash falls back to the timer, per spec §8
}

// A ~20-line hash router (spec §8: "a 40 line hash router", not React
// Router, for three routes). Direct-loading #/history works because the
// initial state reads the current hash; back/forward work because the
// browser's own navigation fires 'hashchange'.
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return route
}

// #/history/<id> selects one fast's card without needing a new top-level
// route (feature request #6, ISSUES.md) -- History.tsx owns this
// sub-navigation itself rather than threading a selected id through
// useRoute()/App.tsx, so the ~20-line contract above stays untouched.
function parseSelectedHistoryId(hash: string): string | null {
  const path = hash.replace(/^#/, '') || '/'
  const match = /^\/history\/(.+)$/.exec(path)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function useSelectedHistoryId(): string | null {
  const [id, setId] = useState<string | null>(() => parseSelectedHistoryId(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => setId(parseSelectedHistoryId(window.location.hash))
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return id
}
