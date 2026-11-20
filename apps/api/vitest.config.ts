import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Resolve @testboard/shared from TypeScript source during tests (no prior build needed).
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
