import { z } from 'zod'
import type { DbConfig } from '../db/pool.js'

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_REQUESTS: booleanFromString.optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  /** Comma-separated browser origins allowed to call mutating endpoints (CSRF defence). */
  ALLOWED_ORIGINS: z.string().optional(),
  COOKIE_SECURE: booleanFromString.optional(),
  SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  logRequests: boolean
  /** null = database not configured (e.g. demo/healthcheck-only runs). */
  db: DbConfig | null
  allowedOrigins: string[]
  /** Secure cookies (HTTPS only). Always true in production. */
  cookieSecure: boolean
  sessionHours: number
  sessionIdleMinutes: number
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

/**
 * Parse and validate process environment. Fails fast with a readable message
 * (never echoing secret values) so misconfiguration is caught at boot.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid API environment configuration: ${fields}`)
  }
  const values = parsed.data

  // Production API must only listen on loopback; Apache reverse-proxies /api to it.
  if (values.NODE_ENV === 'production' && !LOOPBACK_HOSTS.has(values.API_HOST)) {
    throw new Error('In production API_HOST must be a loopback address (e.g. 127.0.0.1).')
  }

  let db: DbConfig | null = null
  if (values.DB_HOST) {
    const missing = (['DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const).filter(
      (key) => values[key] === undefined || values[key] === '',
    )
    if (missing.length > 0) {
      throw new Error(`Invalid API environment configuration: ${missing.join(', ')}`)
    }
    db = {
      host: values.DB_HOST,
      port: values.DB_PORT,
      database: values.DB_NAME as string,
      user: values.DB_USER as string,
      password: values.DB_PASSWORD as string,
      connectionLimit: values.DB_POOL_SIZE,
    }
  }
  const allowedOrigins = (values.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
  if (values.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    throw new Error('In production ALLOWED_ORIGINS must list the public site origin(s).')
  }
  if (values.NODE_ENV === 'production' && !db) {
    throw new Error(
      'In production the database settings (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are required.',
    )
  }

  return {
    nodeEnv: values.NODE_ENV,
    host: values.API_HOST,
    port: values.API_PORT,
    logRequests: values.LOG_REQUESTS ?? values.NODE_ENV === 'development',
    db,
    allowedOrigins:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ['http://127.0.0.1:5173', 'http://localhost:5173'],
    cookieSecure: values.NODE_ENV === 'production' ? true : (values.COOKIE_SECURE ?? false),
    sessionHours: values.SESSION_HOURS,
    sessionIdleMinutes: values.SESSION_IDLE_MINUTES,
  }
}
