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

  if (route === 'history') return <History />
  if (route === 'settings') return <Settings />
  return <Timer />
}
