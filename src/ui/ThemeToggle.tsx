import type { Theme } from '../core/color'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

// Quick day/night override next to the eyebrow (feature request #5,
// ISSUES.md) -- ported from a shadcn/Tailwind reference into plain CSS +
// hand-rolled SVG icons (no lucide-react, same runtime-dep-budget
// rationale as the card glow/backdrop ports). Reflects the *resolved*
// theme, not settings.theme directly: toggling always picks an explicit
// day/night, leaving 'auto' reachable only from Settings' 3-way control.
// The button itself is a 44px touch target (spec §11); the visible pill
// is a smaller decoration centered inside it, not the hit area.
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isNight = theme === 'night'

  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={isNight}
      aria-label={isNight ? 'Switch to day theme' : 'Switch to night theme'}
      onClick={onToggle}
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb">{isNight ? <MoonIcon /> : <SunIcon />}</span>
      </span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
      <path
        strokeLinecap="round"
        d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.3A8.5 8.5 0 1 1 9.7 4a7 7 0 0 0 10.3 10.3Z" />
    </svg>
  )
}
