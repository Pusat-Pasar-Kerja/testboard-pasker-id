import {
  API_BASE_PATH,
  PUBLIC_SITE_SETTING_KEYS,
  REQUEST_ID_HEADER,
  type PublicSiteSettings,
  type SiteSettings,
} from '@testboard/shared'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import type { Pool } from 'mysql2/promise'
import { csrfMiddleware, sessionMiddleware } from './auth/middleware.js'
import type { AppConfig } from './config/env.js'
import type { DatabaseHealth } from './db/pool.js'
import {
  AppError,
  consoleErrorLogger,
  createErrorHandler,
  errorBody,
  type ErrorLogger,
} from './lib/errors.js'
import { createFileService, type FileService } from './files/pipeline.js'
import { ImportStore } from './imports/analyze.js'
import { readAppVersion } from './lib/version.js'
import { createSettingsService, type SettingsService } from './settings/service.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { projectRoutes } from './routes/projects.js'
import { publicRoutes } from './routes/public.js'
import { recoveryAdminRoutes, recoveryPublicRoutes } from './routes/recovery.js'
import { workshopRoutes } from './routes/workshop.js'
import type { AppEnv } from './types.js'

export interface AppDeps {
  config: AppConfig
  /** Database pool; without it only /health is served (other routes answer 503). */
  pool?: Pool | null
  version?: string
  logError?: ErrorLogger
  /** Database probe; omitted when no database is configured. */
  checkDatabase?: () => Promise<DatabaseHealth>
  /** Evidence storage + processing; created from config when omitted. */
  files?: FileService
  /** Website settings (Super Admin); created from config when omitted. */
  settings?: SettingsService
}

function publicSettings(all: SiteSettings): PublicSiteSettings {
  return Object.fromEntries(
    PUBLIC_SITE_SETTING_KEYS.map((key) => [key, all[key]]),
  ) as PublicSiteSettings
}

const UPLOAD_PATH = /(\/projects\/[^/]+\/(files|imports)|\/workshop\/files)\/?$/

/** What a workshop table card may reach: Mode Mudah, the public pages and its own session. */
const TABLE_ALLOWED =
  /\/api\/v1\/(workshop|public)(\/|$)|\/api\/v1\/(auth\/(me|logout)|settings\/public|health)$/

export function createApp({
  config,
  pool = null,
  version = readAppVersion(),
  logError = consoleErrorLogger,
  checkDatabase = async () => 'not_configured',
  files,
  settings = createSettingsService(pool, config),
}: AppDeps) {
  const app = new Hono<AppEnv>()

  // Correlation id: reuses a safe incoming X-Request-Id or generates one; echoed in the response.
  app.use('*', requestId({ headerName: REQUEST_ID_HEADER }))
  app.use('*', secureHeaders())
  if (config.logRequests) app.use('*', logger())

  const api = new Hono<AppEnv>()
  api.route('/health', healthRoutes(version, checkDatabase))

  if (pool) {
    const fileService =
      files ??
      createFileService(pool, config, {
        logError: (error) => logError(undefined, error),
      })
    // JSON APIs never need large bodies. Evidence uploads stream to disk with their own
    // per-file and per-request limits (routes/files.ts).
    const jsonLimit = bodyLimit({ maxSize: 1024 * 1024 })
    api.use('*', (c, next) =>
      c.req.method === 'POST' && UPLOAD_PATH.test(c.req.path) ? next() : jsonLimit(c, next),
    )
    api.use('*', sessionMiddleware(pool, config, settings))
    api.use('*', csrfMiddleware(config))
    // A table card (Mode Workshop) is never a project member or a staff account.
    api.use('*', async (c, next) => {
      if (c.get('auth')?.accountKind === 'TABLE' && !TABLE_ALLOWED.test(c.req.path)) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.')
      }
      await next()
    })
    api.use('*', async (c, next) => {
      await next()
      // Authenticated API responses are private and must never be cached by proxies.
      c.header('Cache-Control', 'no-store')
    })
    // Public: site name, banner, default language and support contact (login page).
    api.get('/settings/public', async (c) => c.json(publicSettings(await settings.get())))
    api.route('/', authRoutes(pool, config, settings))
    api.route('/public', publicRoutes(pool, fileService))
    api.route('/workshop', workshopRoutes(pool, config, settings, fileService))
    api.route('/', recoveryPublicRoutes(pool))
    api.route('/', projectRoutes(pool, fileService, new ImportStore(config.storageDir)))
    api.route('/admin', adminRoutes(pool, settings))
    api.route('/admin', recoveryAdminRoutes(pool, settings))
  } else {
    api.all('*', () => {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is not configured.')
    })
  }

  app.route(API_BASE_PATH, api)

  app.notFound((c) => c.json(errorBody(c, 'NOT_FOUND'), 404))
  app.onError(createErrorHandler(logError))

  return app
}

export type App = ReturnType<typeof createApp>
