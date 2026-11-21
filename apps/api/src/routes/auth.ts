import {
  changePasswordSchema,
  loginSchema,
  profileUpdateSchema,
  type CurrentUser,
  type MemberRole,
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
    is_super_admin: number
  }>(
    db,
    `SELECT u.id, u.display_name, u.email, u.preferred_locale,
            EXISTS (SELECT 1 FROM user_system_roles r
                     WHERE r.user_id = u.id AND r.role_code = 'SUPER_ADMIN') AS is_super_admin
       FROM users u WHERE u.id = ?`,
    [userId],
  )
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.')
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
    is_super_admin: Boolean(Number(user.is_super_admin)),
    projects,
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
      await createSession(conn, c, sessionConfig, userId)
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: userId,
        action: 'LOGIN',
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
