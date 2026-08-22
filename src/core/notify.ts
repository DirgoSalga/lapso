export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getPermissionState(): PermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

// iOS Safari only exposes Notification.requestPermission once the site has
// been added to the Home Screen (spec §6.2). Settings should show an inline
// instruction here instead of a control that silently does nothing.
export function isIosNonStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent)
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return isIos && standalone === false
}

// Must be called only from inside a user gesture -- e.g. a Settings
// toggle's onClick -- never on page load (spec §6.2).
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!isNotificationSupported() || isIosNonStandalone()) return 'unsupported'
  return Notification.requestPermission()
}

// Always dispatched through the service worker registration, never by
// constructing the Notification object directly -- that throws on
// Android/Chrome (spec §6.2). No-ops quietly if permission isn't granted
// or no service worker is registered yet (the SW itself is Phase 8); the
// in-app rendering path (aria-live region / catch-up card) is what
// carries the message either way.
export async function showMilestoneNotification(title: string, body: string): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return
  await registration.showNotification(title, { body, tag: 'lapso-milestone' })
}
