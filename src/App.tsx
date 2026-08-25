import { useEffect, useState } from 'react'
import { loadSettings, subscribe } from './core/storage'
import { History } from './ui/History'
import { useRoute } from './ui/router'
import { Settings } from './ui/Settings'
import { Timer } from './ui/Timer'

export default function App() {
  const route = useRoute()

  // App-wide, not Timer-scoped: switching theme from Settings or History
  // must apply live even though those screens don't render the ring that
  // consumes the rest of the heat-ramp machinery.
  const [themePreference, setThemePreference] = useState(() => loadSettings().theme)
  useEffect(() => subscribe(() => setThemePreference(loadSettings().theme)), [])
  useEffect(() => {
    document.documentElement.dataset.theme = themePreference
  }, [themePreference])

  return (
    <>
      {/* Dot-grid texture (feature request #4 follow-up, ISSUES.md), now
          global rather than active-fast-only: one instance behind every
          screen instead of each screen rendering its own. */}
      <div className="fast-backdrop" aria-hidden="true" />
      {route === 'history' ? <History /> : route === 'settings' ? <Settings /> : <Timer />}
    </>
  )
}
