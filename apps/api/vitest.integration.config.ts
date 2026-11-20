import { defineConfig } from 'vitest/config'

/** Integration tests against the LOCAL database (npm run db:start first). Never the VPS. */
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
  },
})
