import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))

// Precaches the app shell for offline launch (spec §7): writes the exact
// hashed build output as sw-assets.json for the service worker to fetch
// and cache on install, and stamps sw.js with a cache-version hash derived
// from that list, so a deploy that actually changes the shell always
// invalidates old caches -- nobody has to remember to bump a version
// number by hand.
function swPrecachePlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'lapso-sw-precache',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir
    },
    writeBundle(_options, bundle) {
      const assets = new Set([
        '/',
        '/manifest.webmanifest',
        '/icons/icon.svg',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      ])
      for (const fileName of Object.keys(bundle)) {
        assets.add(`/${fileName}`)
      }
      const list = [...assets].sort()
      const version = createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 10)

      writeFileSync(resolve(rootDir, outDir, 'sw-assets.json'), JSON.stringify(list))

      const swSource = readFileSync(resolve(rootDir, 'public/sw.js'), 'utf8')
      writeFileSync(resolve(rootDir, outDir, 'sw.js'), swSource.replaceAll('__CACHE_VERSION__', version))
    },
  }
}

export default defineConfig({
  plugins: [react(), swPrecachePlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
})
