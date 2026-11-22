import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Pool } from 'mysql2/promise'
import type { AppConfig } from '../config/env.js'
import { execute, select, selectOne, type Db } from '../db/tx.js'
import { randomToken, sha256Hex } from '../lib/crypto.js'
import type { AppEnv, AuthContext } from '../types.js'

/**
 * Opaque server-side sessions (migration 0002). The browser holds a random token in an
 * HttpOnly cookie; the database only stores SHA-256(token), so a database leak does not
 * expose live sessions. A second, JS-readable cookie carries the CSRF token whose hash is
 * bound to the session (double-submit + server-side check).
 */
export function cookieNames(secure: boolean) {
  // __Host- prefix: Secure, Path=/, no Domain -> cannot be set by a sibling subdomain.
  return secure
    ? { session: '__Host-tb_session', csrf: '__Host-tb_csrf' }
    : { session: 'tb_session', csrf: 'tb_csrf' }
}

const TOUCH_INTERVAL_MS = 5 * 60_000

export interface SessionOptions {
  /**
   * "Selalu login di perangkat ini" (ADR 0015): the session lasts `rememberDays` days with no
   * idle limit, in a cookie that survives closing the browser. Otherwise the session ends
   * after `sessionHours` or `sessionIdleMinutes` without activity, and the cookie ends with
   * the browser session.
   */
  remember?: boolean
  /** Fixed end (e.g. a workshop table card); implies a remembered session. */
  expiresAt?: Date
}

export async function createSession(
  db: Db,
  c: Context<AppEnv>,
  config: AppConfig,
  userId: string,
  options: SessionOptions = {},
): Promise<{ csrfToken: string; expiresAt: Date; remembered: boolean }> {
  const token = randomToken()
  const csrfToken = randomToken()
  const remembered =
    Boolean(options.expiresAt) || (options.remember === true && config.rememberDays > 0)
  const expires =
    options.expiresAt ??
    new Date(
      Date.now() +
        (remembered ? config.rememberDays * 24 * 3_600_000 : config.sessionHours * 3_600_000),
    )
  await execute(
    db,
    `INSERT INTO user_sessions
       (id, user_id, csrf_token_hash, expires_at, remember_device, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      sha256Hex(token),
      userId,
      sha256Hex(csrfToken),
      expires,
      remembered ? 1 : 0,
      clientIp(c),
      (c.req.header('User-Agent') ?? '').slice(0, 255) || null,
    ],
  )
  const names = cookieNames(config.cookieSecure)
  const base = {
    path: '/',
    secure: config.cookieSecure,
    sameSite: 'Lax' as const,
    // No Max-Age = the cookie ends when the browser is closed.
    ...(remembered
      ? { maxAge: Math.max(60, Math.floor((expires.getTime() - Date.now()) / 1000)) }
      : {}),
  }
  setCookie(c, names.session, token, { ...base, httpOnly: true })
  setCookie(c, names.csrf, csrfToken, { ...base, httpOnly: false })
  return { csrfToken, expiresAt: expires, remembered }
}

export function clearSessionCookies(c: Context<AppEnv>, config: AppConfig): void {
  const names = cookieNames(config.cookieSecure)
  const options = { path: '/', secure: config.cookieSecure }
  deleteCookie(c, names.session, options)
  deleteCookie(c, names.csrf, options)
}

/**
 * Client address for login throttling and audit. The API only listens on loopback, so the
 * one hop allowed to talk to it is the local Apache proxy, which APPENDS the real client
 * address to X-Forwarded-For. Earlier entries are whatever the client sent and are never
 * trusted (a spoofed header must not bypass the login lockout).
 */
export function clientIp(c: Context<AppEnv>): string | null {
  const hops = (c.req.header('X-Forwarded-For') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean)
  const last = hops.at(-1)
  if (last) return last.slice(0, 45)
  try {
    return getConnInfo(c).remote.address?.slice(0, 45) ?? null
  } catch {
    return null // no socket (in-process tests)
  }
}

interface SessionRow {
  id: string
  user_id: string
  csrf_token_hash: string
  last_seen_at: Date
  email: string
  display_name: string
  preferred_locale: string
  is_super_admin: number
  auth_provider: string
}

/** Resolve the session cookie to an active user, enforcing absolute and idle expiry. */
export async function loadSession(
  pool: Pool,
  c: Context<AppEnv>,
  config: AppConfig,
): Promise<AuthContext | null> {
  const token = getCookie(c, cookieNames(config.cookieSecure).session)
  if (!token || token.length > 200) return null
  const row = await selectOne<SessionRow>(
    pool,
    `SELECT s.id, s.user_id, s.csrf_token_hash, s.last_seen_at,
            u.email, u.display_name, u.preferred_locale, u.auth_provider,
            EXISTS (SELECT 1 FROM user_system_roles r
                     WHERE r.user_id = u.id AND r.role_code = 'SUPER_ADMIN') AS is_super_admin
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > UTC_TIMESTAMP(3)
        AND (s.remember_device = 1
             OR s.last_seen_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE)
        AND u.is_active = 1`,
    [sha256Hex(token), config.sessionIdleMinutes],
  )
  if (!row) return null

  if (Date.now() - row.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await execute(pool, 'UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = ?', [
      row.id,
    ])
  }
  return {
    userId: String(row.user_id),
    email: row.email,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale === 'en' ? 'en' : 'id',
    isSuperAdmin: Boolean(Number(row.is_super_admin)),
    sessionId: row.id,
    csrfTokenHash: row.csrf_token_hash,
    accountKind: row.auth_provider === 'WORKSHOP' ? 'TABLE' : 'PERSON',
  }
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await execute(
    db,
    'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE id = ? AND revoked_at IS NULL',
    [sessionId],
  )
}

/** Revoke every session of a user (optionally keeping the current one). */
export async function revokeUserSessions(db: Db, userId: string, keepSessionId?: string) {
  await execute(
    db,
    `UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3)
      WHERE user_id = ? AND revoked_at IS NULL AND id <> ?`,
    [userId, keepSessionId ?? ''],
  )
}

export interface SessionDevice {
  id: string
  created_at: Date
  last_seen_at: Date
  expires_at: Date
  remember_device: number
  ip_address: string | null
  user_agent: string | null
}

/** Active sessions of a user (newest activity first) for "Perangkat yang sedang masuk". */
export async function listUserSessions(db: Db, userId: string, idleMinutes: number) {
  return select<SessionDevice>(
    db,
    `SELECT id, created_at, last_seen_at, expires_at, remember_device, ip_address, user_agent
       FROM user_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
        AND (remember_device = 1 OR last_seen_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE)
      ORDER BY last_seen_at DESC
      LIMIT 50`,
    [userId, idleMinutes],
  )
}
