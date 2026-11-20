import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  systemSettingSchema,
  type AdminUserDto,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requireSuperAdmin } from '../auth/middleware.js'
import { hashPassword } from '../auth/passwords.js'
import { revokeUserSessions } from '../auth/sessions.js'
import {
  execute,
  insertedId,
  iso,
  isDuplicateKey,
  parseJson,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { temporaryPassword } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

interface UserRow {
  id: string
  display_name: string
  email: string
  preferred_locale: string
  is_active: number
  is_super_admin: number
  created_at: Date
}

async function listUsers(db: Db, userId?: string, q?: string): Promise<AdminUserDto[]> {
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null
  const rows = await select<UserRow>(
    db,
    `SELECT u.id, u.display_name, u.email, u.preferred_locale, u.is_active, u.created_at,
            EXISTS (SELECT 1 FROM user_system_roles r
                     WHERE r.user_id = u.id AND r.role_code = 'SUPER_ADMIN') AS is_super_admin
       FROM users u
      WHERE (? IS NULL OR u.id = ?) AND (? IS NULL OR u.email LIKE ? OR u.display_name LIKE ?)
      ORDER BY u.display_name
      LIMIT 500`,
    [userId ?? null, userId ?? null, like, like, like],
  )
  return rows.map((row) => ({
    id: String(row.id),
    display_name: row.display_name,
    email: row.email,
    preferred_locale: row.preferred_locale === 'en' ? 'en' : 'id',
    is_active: Number(row.is_active) === 1,
    is_super_admin: Number(row.is_super_admin) === 1,
    created_at: iso(row.created_at) as string,
  }))
}

/** Website-level administration (ADR 0004). Every route is Super Admin only. */
export function adminRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()
  routes.use('*', async (c, next) => {
    requireSuperAdmin(c)
    await next()
  })

  routes.get('/users', async (c) => c.json(await listUsers(pool, undefined, c.req.query('q'))))

  routes.post('/users', async (c) => {
    const actor = requireSuperAdmin(c)
    const input = await parseBody(c, adminUserCreateSchema)
    const generated = input.password ? null : temporaryPassword()
    const passwordHash = await hashPassword(input.password ?? (generated as string))
    const userId = await withTransaction(pool, async (conn) => {
      let id: string
      try {
        const result = await execute(
          conn,
          `INSERT INTO users (display_name, email, password_hash, auth_provider, preferred_locale)
           VALUES (?, ?, ?, 'LOCAL', ?)`,
          [input.display_name, input.email, passwordHash, input.preferred_locale],
        )
        id = insertedId(result)
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'An account with this e-mail already exists.', [
            { field: 'email', message: 'Already used' },
          ])
        }
        throw error
      }
      if (input.is_super_admin) {
        await execute(
          conn,
          "INSERT INTO user_system_roles (user_id, role_code, granted_by) VALUES (?, 'SUPER_ADMIN', ?)",
          [id, actor.userId],
        )
      }
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: id,
        action: 'CREATE',
        newValues: {
          email: input.email,
          display_name: input.display_name,
          is_super_admin: input.is_super_admin,
        },
      })
      return id
    })
    const [user] = await listUsers(pool, userId)
    // A generated temporary password is shown exactly once and never stored in plaintext.
    return c.json({ user, temporary_password: generated }, 201)
  })

  routes.patch('/users/:userId', async (c) => {
    const actor = requireSuperAdmin(c)
    const userId = idParam(c, 'userId')
    const input = await parseBody(c, adminUserUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = (await listUsers(conn, userId))[0]
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      const removesSuperAdmin =
        before.is_super_admin && (input.is_super_admin === false || input.is_active === false)
      if (removesSuperAdmin) {
        const admins = await select(
          conn,
          `SELECT r.user_id FROM user_system_roles r JOIN users u ON u.id = r.user_id
            WHERE r.role_code = 'SUPER_ADMIN' AND u.is_active = 1 FOR UPDATE`,
        )
        if (admins.length <= 1) {
          throw new AppError(409, 'CONFLICT', 'At least one active Super Admin must remain.')
        }
      }
      await execute(
        conn,
        'UPDATE users SET display_name = COALESCE(?, display_name), is_active = COALESCE(?, is_active) WHERE id = ?',
        [
          input.display_name ?? null,
          input.is_active === undefined ? null : input.is_active ? 1 : 0,
          userId,
        ],
      )
      if (input.is_super_admin === true && !before.is_super_admin) {
        await execute(
          conn,
          "INSERT INTO user_system_roles (user_id, role_code, granted_by) VALUES (?, 'SUPER_ADMIN', ?)",
          [userId, actor.userId],
        )
      }
      if (input.is_super_admin === false && before.is_super_admin) {
        await execute(
          conn,
          "DELETE FROM user_system_roles WHERE user_id = ? AND role_code = 'SUPER_ADMIN'",
          [userId],
        )
      }
      // A deactivated account is signed out everywhere immediately.
      if (input.is_active === false) await revokeUserSessions(conn, userId)
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: userId,
        action: 'UPDATE',
        oldValues: {
          display_name: before.display_name,
          is_active: before.is_active,
          is_super_admin: before.is_super_admin,
        },
        newValues: input,
      })
    })
    const [user] = await listUsers(pool, userId)
    return c.json(user)
  })

  routes.get('/settings', async (c) => {
    const rows = await select<{ setting_key: string; value_json: unknown; updated_at: Date }>(
      pool,
      'SELECT setting_key, value_json, updated_at FROM system_settings ORDER BY setting_key',
    )
    return c.json(
      rows.map((row) => ({
        key: row.setting_key,
        value: parseJson(row.value_json),
        updated_at: iso(row.updated_at),
      })),
    )
  })

  routes.put('/settings/:key', async (c) => {
    const actor = requireSuperAdmin(c)
    const key = c.req.param('key')
    if (!/^[a-z][a-z0-9_.]{2,119}$/.test(key)) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const input = await parseBody(c, systemSettingSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<{ value_json: unknown }>(
        conn,
        'SELECT value_json FROM system_settings WHERE setting_key = ? FOR UPDATE',
        [key],
      )
      await execute(
        conn,
        `INSERT INTO system_settings (setting_key, value_json, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
        [key, JSON.stringify(input.value), actor.userId],
      )
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'system_setting',
        entityId: '0',
        action: 'UPDATE',
        oldValues: { key, value: parseJson(before?.value_json) },
        newValues: { key, value: input.value },
      })
    })
    return c.json({ key, value: input.value })
  })

  return routes
}
