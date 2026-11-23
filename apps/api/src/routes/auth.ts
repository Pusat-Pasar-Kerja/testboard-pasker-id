import {
  changePasswordSchema,
  loginSchema,
  profileUpdateSchema,
  type CurrentUser,
  type MemberRole,
  type SessionDeviceDto,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { isLoginBlocked, recordLoginAttempt } from '../auth/login-attempts.js'
import { requireAuth } from '../auth/middleware.js'
import { dummyPasswordHash, hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  clearSessionCookies,
  clientIp,
  createSession,
  listUserSessions,
  revokeSession,
  revokeUserSessions,
} from '../auth/sessions.js'
import type { AppConfig } from '../config/env.js'
import { execute, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { parseBody } from '../lib/validation.js'
import type { SettingsService } from '../settings/service.js'
import type { AppEnv } from '../types.js'

export async function currentUserDto(db: Db, userId: string): Promise<CurrentUser> {
  const user = await selectOne<{
    id: string
    display_name: string
    email: string
    preferred_locale: string
    system_role: string | null
    auth_provider: string
  }>(
    db,
    `SELECT u.id, u.display_name, u.email, u.preferred_locale, u.auth_provider,
            (SELECT r.role_code FROM user_system_roles r
              WHERE r.user_id = u.id AND r.role_code IN ('SUPER_ADMIN', 'ADMIN')
              ORDER BY r.role_code = 'SUPER_ADMIN' DESC LIMIT 1) AS system_role
       FROM users u WHERE u.id = ?`,
    [userId],
  )
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.')
  const table = user.auth_provider === 'WORKSHOP'
  const systemRole =
    !table && (user.system_role === 'SUPER_ADMIN' || user.system_role === 'ADMIN')
      ? user.system_role
      : null
  const projects = await select<{ project_code: string; role_code: MemberRole }>(
    db,
    `SELECT p.project_code, m.role_code
       FROM project_members m JOIN projects p ON p.id = m.project_id
      WHERE m.user_id = ? ORDER BY p.project_code`,
    [userId],
  )
  return {
    id: String(user.id),
    display_name: user.display_name,
    email: user.email,
    preferred_locale: user.preferred_locale === 'en' ? 'en' : 'id',
    system_role: systemRole,
    is_super_admin: systemRole === 'SUPER_ADMIN',
    projects,
    account_kind: user.auth_provider === 'WORKSHOP' ? 'TABLE' : 'PERSON',
  }
}

const INVALID_LOGIN = 'Invalid email or password.'

export function authRoutes(pool: Pool, config: AppConfig, settings: SettingsService) {
  const routes = new Hono<AppEnv>()

  routes.post('/auth/login', async (c) => {
    const input = await parseBody(c, loginSchema)
    const ip = clientIp(c)
    if (await isLoginBlocked(pool, input.email, ip)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many failed attempts. Try again later.')
    }

    const user = await selectOne<{ id: string; password_hash: string | null; is_active: number }>(
      pool,
      `SELECT id, password_hash, is_active FROM users
        WHERE email = ? AND auth_provider = 'LOCAL'`,
      [input.email],
    )
    // Always run one Argon2 verification so timing does not reveal whether the e-mail exists.
    const valid = await verifyPassword(
      user?.password_hash ?? (await dummyPasswordHash()),
      input.password,
    )
    const ok = Boolean(user && user.password_hash && Number(user.is_active) === 1 && valid)
    await recordLoginAttempt(pool, input.email, ip, ok)
    if (!ok || !user) throw new AppError(401, 'UNAUTHENTICATED', INVALID_LOGIN)

    const userId = String(user.id)
    const sessionConfig = await settings.sessionConfig(config)
    await withTransaction(pool, async (conn) => {
      const session = await createSession(conn, c, sessionConfig, userId, {
        remember: input.remember,
      })
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: userId,
        action: 'LOGIN',
        newValues: { remember_device: session.remembered },
      })
    })
    return c.json({ user: await currentUserDto(pool, userId) })
  })

  routes.post('/auth/logout', async (c) => {
    const auth = c.get('auth')
    if (auth) {
      await withTransaction(pool, async (conn) => {
        await revokeSession(conn, auth.sessionId)
        await writeAudit(conn, c, {
          projectId: null,
          entityType: 'user',
          entityId: auth.userId,
          action: 'LOGOUT',
        })
      })
    }
    clearSessionCookies(c, config)
    return c.body(null, 204)
  })

  routes.get('/auth/me', async (c) => {
    const auth = requireAuth(c)
    c.header('Cache-Control', 'no-store')
    return c.json(await currentUserDto(pool, auth.userId))
  })

  routes.patch('/profile', async (c) => {
    const auth = requireAuth(c)
    const input = await parseBody(c, profileUpdateSchema)
    await withTransaction(pool, async (conn) => {
      await execute(
        conn,
        `UPDATE users SET display_name = COALESCE(?, display_name),
                          preferred_locale = COALESCE(?, preferred_locale)
          WHERE id = ?`,
        [input.display_name ?? null, input.preferred_locale ?? null, auth.userId],
      )
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: auth.userId,
        action: 'UPDATE',
        newValues: input,
      })
    })
    return c.json(await currentUserDto(pool, auth.userId))
  })

  // "Perangkat yang sedang masuk" (ADR 0015): own sessions only, never the token or its hash.
  routes.get('/profile/sessions', async (c) => {
    const auth = requireAuth(c)
    c.header('Cache-Control', 'no-store')
    const sessionConfig = await settings.sessionConfig(config)
    const rows = await listUserSessions(pool, auth.userId, sessionConfig.sessionIdleMinutes)
    const items: SessionDeviceDto[] = rows.map((row) => ({
      key: row.id.slice(0, 16),
      current: row.id === auth.sessionId,
      remembered: Number(row.remember_device) === 1,
      user_agent: row.user_agent ?? '',
      created_at: row.created_at.toISOString(),
      last_seen_at: row.last_seen_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
    }))
    return c.json(items)
  })

  routes.post('/profile/sessions/revoke-others', async (c) => {
    const auth = requireAuth(c)
    await withTransaction(pool, async (conn) => {
      await revokeUserSessions(conn, auth.userId, auth.sessionId)
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: auth.userId,
        action: 'LOGOUT',
        newValues: { scope: 'OTHER_DEVICES' },
      })
    })
    return c.body(null, 204)
  })

  routes.post('/profile/change-password', async (c) => {
    const auth = requireAuth(c)
    const input = await parseBody(c, changePasswordSchema)
    const row = await selectOne<{ password_hash: string | null }>(
      pool,
      'SELECT password_hash FROM users WHERE id = ?',
      [auth.userId],
    )
    if (!row?.password_hash || !(await verifyPassword(row.password_hash, input.current_password))) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'current_password', message: 'Current password is incorrect' },
      ])
    }
    if (input.new_password.toLowerCase().includes(auth.email.split('@')[0] ?? '\u0000')) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'new_password', message: 'Password must not contain your e-mail name' },
      ])
    }
    const newHash = await hashPassword(input.new_password)
    await withTransaction(pool, async (conn) => {
      await execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', [newHash, auth.userId])
      // Every other device is signed out after a password change.
      await revokeUserSessions(conn, auth.userId, auth.sessionId)
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: auth.userId,
        action: 'PASSWORD_CHANGE',
      })
    })
    return c.body(null, 204)
  })

  return routes
}
