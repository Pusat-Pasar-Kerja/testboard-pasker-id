import { z } from 'zod'

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_REQUESTS: booleanFromString.optional(),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  logRequests: boolean
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

  return {
    nodeEnv: values.NODE_ENV,
    host: values.API_HOST,
    port: values.API_PORT,
    logRequests: values.LOG_REQUESTS ?? values.NODE_ENV === 'development',
  }
}
