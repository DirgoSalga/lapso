// __CACHE_VERSION__ is replaced at build time (see the swPrecache Vite
// plugin) with a hash of the precached asset list, so every deploy that
// actually changes the shell gets a fresh cache name automatically --
// nobody has to remember to bump a version number by hand.
const CACHE = 'lapso-shell-__CACHE_VERSION__'
const CACHE_PREFIX = 'lapso-shell-'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch('/sw-assets.json')
        const assets = await response.json()
        await cache.addAll(assets)
      } catch {
        // No manifest (e.g. running unbuilt) -- the fetch handler below
        // still caches pages opportunistically as they're visited.
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE && key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

// Cache-first for the app shell; network is only ever a fallback, since
// this app has no server dependency to stay fresh against (spec §7).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    (async () => {
      // ignoreVary matters here: a `<script crossorigin>`/`<link crossorigin>`
      // request sends an Origin header, and some static hosts (and Vite's
      // own preview server) reply `Vary: Origin` on those assets. The Cache
      // API respects Vary by default, so without this the exact same URL
      // that was just precached at install still misses on every reload --
      // the offline shell silently degrades to script/style 404s.
      const cached = await caches.match(event.request, { ignoreVary: true })
      if (cached) return cached

      try {
        const response = await fetch(event.request)
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const cache = await caches.open(CACHE)
          cache.put(event.request, response.clone())
        }
        return response
      } catch (err) {
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('/', { ignoreVary: true })
          if (shell) return shell
        }
        throw err
      }
    })(),
  )
})
