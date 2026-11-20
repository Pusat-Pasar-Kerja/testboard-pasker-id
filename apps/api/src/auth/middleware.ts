import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Pool } from 'mysql2/promise'
import type { AppConfig } from '../config/env.js'
import { safeEqual, sha256Hex } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import type { AppEnv, AuthContext } from '../types.js'
import { cookieNames, loadSession } from './sessions.js'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Attach `auth` (or null) from the session cookie on every request. */
export function sessionMiddleware(pool: Pool, config: AppConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('auth', await loadSession(pool, c, config))
    await next()
  }
}

/**
 * CSRF defence for state-changing requests:
 * 1. a browser Origin header, when present, must be one of ALLOWED_ORIGINS (also covers login);
 * 2. signed-in requests must echo the CSRF cookie in X-CSRF-Token, and its hash must match
 *    the one bound to the session (so a token from another session is useless).
 */
export function csrfMiddleware(config: AppConfig): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!MUTATING.has(c.req.method)) return next()

    const origin = c.req.header('Origin')
    if (origin && !config.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      throw new AppError(403, 'FORBIDDEN', 'Request origin is not allowed.')
    }

    const auth = c.get('auth')
    if (auth) {
      const header = c.req.header('X-CSRF-Token') ?? ''
      const cookie = getCookie(c, cookieNames(config.cookieSecure).csrf) ?? ''
      const valid =
        header !== '' &&
        safeEqual(header, cookie) &&
        safeEqual(sha256Hex(header), auth.csrfTokenHash)
      if (!valid) throw new AppError(403, 'FORBIDDEN', 'Missing or invalid CSRF token.')
    }
    await next()
  }
}

export function requireAuth(c: Context<AppEnv>): AuthContext {
  const auth = c.get('auth')
  if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  return auth
}

export function requireSuperAdmin(c: Context<AppEnv>): AuthContext {
  const auth = requireAuth(c)
  if (!auth.isSuperAdmin) throw new AppError(403, 'FORBIDDEN', 'Super Admin only.')
  return auth
}
