/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defaultClientConditions, defineConfig, loadEnv, type Plugin } from 'vite'

/** The release number shown in the footer ("Versi 1.0.0"), from this package. */
const APP_VERSION = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

/** The live address; used when the build is not told its own (local builds, demo). */
const LIVE_URL = 'https://paskerid.kemnaker.go.id/testboard/'

/**
 * Link previews (WhatsApp, Telegram, Facebook, LinkedIn, X) only show the picture when its
 * address is complete (https://...). index.html writes %SITE_URL%; the server's deploy
 * script passes its PUBLIC_URL as VITE_SITE_URL, anything else falls back to the live site.
 */
function sharePreview(siteUrl: string | undefined): Plugin {
  const given = siteUrl?.trim() ?? ''
  const absolute = given.startsWith('https://') || given.startsWith('http://')
  const url = absolute ? (given.endsWith('/') ? given : `${given}/`) : LIVE_URL
  return {
    name: 'testboard-share-preview',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Dev-only proxy target. Not prefixed with VITE_, so it never reaches the browser bundle.
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8787'

  return {
    // '/' for a dedicated subdomain, '/testboard/' for a subpath deploy (DEC-16, still open).
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), sharePreview(env.VITE_SITE_URL)],
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
    resolve: {
      // Consume @testboard/shared straight from TypeScript source.
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // Same-origin /api in dev, mirroring the Apache reverse proxy in production.
        '/api': { target: apiProxyTarget, changeOrigin: false },
      },
    },
    preview: { host: '127.0.0.1', port: 4173 },
    build: {
      sourcemap: false,
      rollupOptions: {
        // zod ships comments Rollup cannot place ("A comment ... contains an annotation");
        // they are harmless and only alarmed people reading the deploy log.
        onwarn(warning, warn) {
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules')) return
          warn(warning)
        },
        output: {
          // Long-lived vendor chunks cache across app releases.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'vendor-react'
            return 'vendor'
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      testTimeout: 45_000,
    },
  }
})
