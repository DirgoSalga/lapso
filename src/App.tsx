import { History } from './ui/History'
import { useRoute } from './ui/router'
import { Settings } from './ui/Settings'
import { Timer } from './ui/Timer'

export default function App() {
  const route = useRoute()
  if (route === 'history') return <History />
  if (route === 'settings') return <Settings />
  return <Timer />
}
