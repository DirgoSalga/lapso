import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getPermissionState,
  isIosNonStandalone,
  isNotificationSupported,
  requestNotificationPermission,
  showMilestoneNotification,
} from './notify'

// Real Android/Chrome throws here -- this class stands in for that so any
// code path that accidentally calls `new Notification()` fails loudly
// instead of silently "working" in a test environment that's more lenient
// than production (spec §6.2).
class ThrowingNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>()
  constructor() {
    throw new Error('new Notification() must never be called directly (spec §6.2)')
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isNotificationSupported() / getPermissionState()', () => {
  it('reports unsupported when Notification does not exist (this test environment, and old browsers)', () => {
    expect(isNotificationSupported()).toBe(false)
    expect(getPermissionState()).toBe('unsupported')
  })

  it('reflects Notification.permission once the API exists', () => {
    ThrowingNotification.permission = 'denied'
    vi.stubGlobal('Notification', ThrowingNotification)
    expect(isNotificationSupported()).toBe(true)
    expect(getPermissionState()).toBe('denied')
  })
})

describe('isIosNonStandalone()', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- test-only cleanup of a non-standard navigator field
    delete navigator.standalone
  })

  it('is false on non-iOS user agents', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)')
    expect(isIosNonStandalone()).toBe(false)
  })

  it('is true on iOS Safari not added to the Home Screen', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    )
    Object.defineProperty(navigator, 'standalone', { value: false, configurable: true })
    expect(isIosNonStandalone()).toBe(true)
  })

  it('is false on iOS once added to the Home Screen', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    )
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isIosNonStandalone()).toBe(false)
  })
})

describe('requestNotificationPermission()', () => {
  it('returns "unsupported" without calling requestPermission when Notification does not exist', async () => {
    expect(await requestNotificationPermission()).toBe('unsupported')
  })

  it('delegates to Notification.requestPermission when supported', async () => {
    ThrowingNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', ThrowingNotification)

    expect(await requestNotificationPermission()).toBe('granted')
    expect(ThrowingNotification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('short-circuits to "unsupported" on iOS not added to the Home Screen, without prompting', async () => {
    ThrowingNotification.requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', ThrowingNotification)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    )
    Object.defineProperty(navigator, 'standalone', { value: false, configurable: true })

    expect(await requestNotificationPermission()).toBe('unsupported')
    expect(ThrowingNotification.requestPermission).not.toHaveBeenCalled()
    // @ts-expect-error -- test-only cleanup
    delete navigator.standalone
  })
})

describe('showMilestoneNotification() (spec §6.1/§6.2: always via the SW registration)', () => {
  it('no-ops when Notification is unsupported', async () => {
    await expect(showMilestoneNotification('Lapso', 'Half way. 8 hours in.')).resolves.toBeUndefined()
  })

  it('no-ops when permission is not granted, without touching serviceWorker', async () => {
    ThrowingNotification.permission = 'default'
    vi.stubGlobal('Notification', ThrowingNotification)
    const getRegistration = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistration } })

    await showMilestoneNotification('Lapso', 'Half way. 8 hours in.')
    expect(getRegistration).not.toHaveBeenCalled()
  })

  it('no-ops when no service worker registration exists yet (pre-Phase-8)', async () => {
    ThrowingNotification.permission = 'granted'
    vi.stubGlobal('Notification', ThrowingNotification)
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    })

    await expect(showMilestoneNotification('Lapso', 'Half way. 8 hours in.')).resolves.toBeUndefined()
  })

  it('dispatches through registration.showNotification, never `new Notification()`, when granted', async () => {
    ThrowingNotification.permission = 'granted'
    vi.stubGlobal('Notification', ThrowingNotification)
    const showNotification = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ showNotification }) },
    })

    await showMilestoneNotification('Lapso', 'Half way. 8 hours in.')

    expect(showNotification).toHaveBeenCalledWith('Lapso', {
      body: 'Half way. 8 hours in.',
      tag: 'lapso-milestone',
    })
  })
})
