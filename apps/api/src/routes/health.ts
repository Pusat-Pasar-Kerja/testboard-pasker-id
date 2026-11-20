import type { HealthResponse } from '@testboard/shared'
import { Hono } from 'hono'
import type { DatabaseHealth } from '../db/pool.js'
import type { AppEnv } from '../types.js'

/**
 * Liveness + dependency check, used by the VPS deploy script after a restart.
 * 200 `ok` when healthy (or no database configured), 503 `degraded` when the database is down.
 */
export function healthRoutes(version: string, checkDatabase: () => Promise<DatabaseHealth>) {
  const routes = new Hono<AppEnv>()

  routes.get('/', async (c) => {
    const database = await checkDatabase()
    const body: HealthResponse = {
      status: database === 'down' ? 'degraded' : 'ok',
      service: 'testboard-api',
      version,
      time: new Date().toISOString(),
      database,
    }
    c.header('Cache-Control', 'no-store')
    return c.json(body, database === 'down' ? 503 : 200)
  })

  return routes
}
