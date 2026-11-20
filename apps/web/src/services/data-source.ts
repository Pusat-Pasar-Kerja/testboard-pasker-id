import type { HealthResponse } from '@testboard/shared'
import type { ApiClient } from './api-client'

/**
 * Single seam between UI and data. Screens depend on this interface only, so the same UI
 * runs against mock data (demo / Cloudflare prototype) or the real API (local / VPS).
 * Milestone 1 extends it with projects, cases, runs, executions and defects.
 */
export interface DataSource {
  readonly kind: 'mock' | 'http'
  getHealth(): Promise<HealthResponse>
}

export function createHttpDataSource(client: ApiClient): DataSource {
  return {
    kind: 'http',
    getHealth: () => client.get<HealthResponse>('/health'),
  }
}

export function createMockDataSource(options: { latencyMs?: number } = {}): DataSource {
  const latencyMs = options.latencyMs ?? 250
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, latencyMs))
  return {
    kind: 'mock',
    async getHealth() {
      await delay()
      return {
        status: 'ok',
        service: 'testboard-api',
        version: 'demo',
        time: new Date().toISOString(),
        database: 'not_configured',
      }
    },
  }
}
