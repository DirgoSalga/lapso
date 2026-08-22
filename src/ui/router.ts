import { useEffect, useState } from 'react'

export type Route = 'timer' | 'history' | 'settings'

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/history') return 'history'
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
