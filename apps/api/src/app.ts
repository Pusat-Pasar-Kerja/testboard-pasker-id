import { API_BASE_PATH, REQUEST_ID_HEADER } from '@testboard/shared'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { AppConfig } from './config/env.js'
import {
  consoleErrorLogger,
  createErrorHandler,
  errorBody,
  type ErrorLogger,
} from './lib/errors.js'
import { readAppVersion } from './lib/version.js'
import { healthRoutes } from './routes/health.js'
import type { AppEnv } from './types.js'

export interface AppDeps {
  config: AppConfig
  version?: string
  logError?: ErrorLogger
}

export function createApp({
  config,
  version = readAppVersion(),
  logError = consoleErrorLogger,
}: AppDeps) {
  const app = new Hono<AppEnv>()

  // Correlation id: reuses a safe incoming X-Request-Id or generates one; echoed in the response.
  app.use('*', requestId({ headerName: REQUEST_ID_HEADER }))
  app.use('*', secureHeaders())
  if (config.logRequests) app.use('*', logger())

  const api = new Hono<AppEnv>()
  api.route('/health', healthRoutes(version))

  app.route(API_BASE_PATH, api)

  app.notFound((c) => c.json(errorBody(c, 'NOT_FOUND'), 404))
  app.onError(createErrorHandler(logError))

  return app
}

export type App = ReturnType<typeof createApp>
