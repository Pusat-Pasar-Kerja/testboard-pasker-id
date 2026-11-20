import type { ApiErrorBody, HealthResponse } from '@testboard/shared'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config/env.js'
import { AppError } from '../src/lib/errors.js'

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 0,
  logRequests: false,
  db: null,
  allowedOrigins: ['http://127.0.0.1:5173'],
  cookieSecure: false,
  sessionHours: 12,
  sessionIdleMinutes: 120,
  storageDir: '.private-storage-unused',
  scan: { engine: 'basic', clamdHost: '127.0.0.1', clamdPort: 3310 },
}

function makeApp() {
  const logError = vi.fn()
  const app = createApp({ config, version: '0.0.0-test', logError })
  return { app, logError }
}

describe('GET /api/v1/health', () => {
  it('returns ok with service metadata and a request id header', async () => {
    const { app } = makeApp()
    const res = await app.request('/api/v1/health')

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as HealthResponse
    expect(body).toMatchObject({
      status: 'ok',
      service: 'testboard-api',
      version: '0.0.0-test',
      database: 'not_configured',
    })
    expect(Number.isNaN(Date.parse(body.time))).toBe(false)
  })

  it('echoes a safe incoming X-Request-Id for log correlation', async () => {
    const { app } = makeApp()
    const res = await app.request('/api/v1/health', { headers: { 'X-Request-Id': 'req-abc-123' } })
    expect(res.headers.get('X-Request-Id')).toBe('req-abc-123')
  })

  it('reports the database state and returns 503 degraded when it is down', async () => {
    const up = createApp({ config, version: 'x', checkDatabase: async () => 'up' })
    const upRes = await up.request('/api/v1/health')
    expect(upRes.status).toBe(200)
    expect(await upRes.json()).toMatchObject({ status: 'ok', database: 'up' })

    const down = createApp({ config, version: 'x', checkDatabase: async () => 'down' })
    const downRes = await down.request('/api/v1/health')
    expect(downRes.status).toBe(503)
    expect(await downRes.json()).toMatchObject({ status: 'degraded', database: 'down' })
  })

  it('sets secure headers', async () => {
    const { app } = makeApp()
    const res = await app.request('/api/v1/health')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('error envelope', () => {
  it('returns NOT_FOUND in the uniform format for unknown routes', async () => {
    const { app } = makeApp()
    const res = await app.request('/does-not-exist', {
      headers: { 'X-Request-Id': 'req-404' },
    })

    expect(res.status).toBe(404)
    const body = (await res.json()) as ApiErrorBody
    expect(body.error).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
      details: [],
      request_id: 'req-404',
    })
  })

  it('answers 503 for data routes when no database is configured', async () => {
    const { app } = makeApp()
    const res = await app.request('/api/v1/projects')
    expect(res.status).toBe(503)
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('maps AppError to its status, code and field details', async () => {
    const { app } = makeApp()
    app.get('/boom-validation', () => {
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid data.', [
        { field: 'expected_result', message: 'Required' },
      ])
    })

    const res = await app.request('/boom-validation')
    expect(res.status).toBe(422)
    const body = (await res.json()) as ApiErrorBody
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details).toEqual([{ field: 'expected_result', message: 'Required' }])
  })

  it('hides internal error details from the client and logs them server-side', async () => {
    const { app, logError } = makeApp()
    app.get('/boom-internal', () => {
      throw new Error('SELECT * FROM users -- secret stack detail')
    })

    const res = await app.request('/boom-internal')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('SELECT')
    expect(text).not.toContain('secret')
    const body = JSON.parse(text) as ApiErrorBody
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(logError).toHaveBeenCalledOnce()
  })
})
