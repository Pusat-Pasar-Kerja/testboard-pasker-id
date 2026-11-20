import { defineConfig } from 'vitest/config'

/**
 * Integration tests against the LOCAL database (npm run db:start first). Never the VPS.
 * global-setup rebuilds a dedicated `testboard_test` database for every run.
 */
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
