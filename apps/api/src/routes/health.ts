import type { HealthResponse } from '@testboard/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../types.js'

export function healthRoutes(version: string) {
  const routes = new Hono<AppEnv>()

  routes.get('/', (c) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'testboard-api',
      version,
      time: new Date().toISOString(),
      // Database wiring arrives in Milestone 3 (local MySQL only, never the VPS).
      database: 'not_configured',
    }
    c.header('Cache-Control', 'no-store')
    return c.json(body)
  })

  return routes
}
