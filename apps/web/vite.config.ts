/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Dev-only proxy target. Not prefixed with VITE_, so it never reaches the browser bundle.
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://127.0.0.1:8787'

  return {
    // '/' for a dedicated subdomain, '/testboard/' for a subpath deploy (DEC-16, still open).
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
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
