import {
  adminProjectUpdateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  auditFilterSchema,
  isOneOf,
  OPEN_DEFECT_STATUSES,
  siteSettingsUpdateSchema,
  SITE_SETTING_KEYS,
  SYSTEM_ROLES,
  wibDayEnd,
  wibDayStart,
  type AdminProjectDto,
  type AdminUserDto,
  type AuditLogEntry,
  type Paginated,
  type SiteSettingKey,
  type SiteSettingsDto,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requireAdmin, requireSuperAdmin } from '../auth/middleware.js'
import { hashPassword } from '../auth/passwords.js'
import { revokeUserSessions } from '../auth/sessions.js'
import {
  execute,
  insertedId,
  iso,
  isDuplicateKey,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { auditEntries, type AuditLogRow } from '../lib/audit-entries.js'
import { temporaryPassword } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams, parseBody, parseWith } from '../lib/validation.js'
import type { SettingsService } from '../settings/service.js'
import type { AppEnv } from '../types.js'

const isSystemRole = isOneOf(SYSTEM_ROLES)

interface UserRow {
  id: string
  display_name: string
  email: string
  preferred_locale: string
  is_active: number
  system_role: string | null
  has_password: number
  is_permanent: number
  created_at: Date
  link_issued_at: Date | null
  link_expires_at: Date | null
}

async function listUsers(db: Db, userId?: string, q?: string): Promise<AdminUserDto[]> {
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null
  const rows = await select<UserRow>(
    db,
    `SELECT u.id, u.display_name, u.email, u.preferred_locale, u.is_active, u.created_at,
            u.password_hash IS NOT NULL AS has_password,
            (SELECT r.role_code FROM user_system_roles r
              WHERE r.user_id = u.id AND r.role_code IN ('SUPER_ADMIN', 'ADMIN')
              ORDER BY r.role_code = 'SUPER_ADMIN' DESC LIMIT 1) AS system_role,
            EXISTS (SELECT 1 FROM user_system_roles r
                     WHERE r.user_id = u.id AND r.role_code = 'SUPER_ADMIN'
                       AND r.is_permanent = 1) AS is_permanent,
            l.issued_at AS link_issued_at, l.expires_at AS link_expires_at
       FROM users u
       LEFT JOIN password_reset_links l
         ON l.active_user_id = u.id AND l.expires_at > UTC_TIMESTAMP(3)
      WHERE u.auth_provider <> 'WORKSHOP' AND (? IS NULL OR u.id = ?)
        AND (? IS NULL OR u.email LIKE ? OR u.display_name LIKE ?)
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
    system_role: isSystemRole(row.system_role) ? row.system_role : null,
    is_super_admin: row.system_role === 'SUPER_ADMIN',
    has_password: Number(row.has_password) === 1,
    is_permanent: Number(row.is_permanent) === 1,
    created_at: iso(row.created_at) as string,
    reset_link:
      row.link_issued_at && row.link_expires_at
        ? {
            issued_at: iso(row.link_issued_at) as string,
            expires_at: iso(row.link_expires_at) as string,
          }
        : null,
  }))
}

/**
 * Website-level administration (ADR 0004, 0017). The project list is for Admins and Super
 * Admins; user accounts, settings and the activity log are for the Super Admin only.
 */
export function adminRoutes(pool: Pool, settings: SettingsService) {
  const routes = new Hono<AppEnv>()
  routes.use('*', async (c, next) => {
    if (/\/admin\/projects(\/|$)/.test(c.req.path)) requireAdmin(c)
    else requireSuperAdmin(c)
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
      if (input.system_role !== 'NONE') {
        await execute(
          conn,
          'INSERT INTO user_system_roles (user_id, role_code, granted_by) VALUES (?, ?, ?)',
          [id, input.system_role, actor.userId],
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
          system_role: input.system_role,
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
      // The owner account is set on the server only and can never be revoked here (ADR 0011).
      const changesRole =
        input.system_role !== undefined && input.system_role !== (before.system_role ?? 'NONE')
      if (before.is_permanent && (changesRole || input.is_active === false)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'The permanent Super Admin cannot be revoked or deactivated.',
          [{ field: 'user', message: 'PERMANENT_SUPER_ADMIN' }],
        )
      }
      const removesSuperAdmin = before.is_super_admin && (changesRole || input.is_active === false)
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
      // One website role at a time: User (none), Admin or Super Admin (ADR 0017).
      if (changesRole && input.system_role) {
        await execute(
          conn,
          "DELETE FROM user_system_roles WHERE user_id = ? AND role_code IN ('SUPER_ADMIN', 'ADMIN')",
          [userId],
        )
        if (input.system_role !== 'NONE') {
          await execute(
            conn,
            'INSERT INTO user_system_roles (user_id, role_code, granted_by) VALUES (?, ?, ?)',
            [userId, input.system_role, actor.userId],
          )
        }
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
          system_role: before.system_role ?? 'NONE',
        },
        newValues: input,
      })
    })
    const [user] = await listUsers(pool, userId)
    return c.json(user)
  })

  // ---- Website settings (ADR 0011) -------------------------------------------------
  async function settingsDto(): Promise<SiteSettingsDto> {
    const rows = await select<{
      setting_key: string
      updated_at: Date
      updated_by: string | null
      display_name: string | null
    }>(
      pool,
      `SELECT s.setting_key, s.updated_at, s.updated_by, u.display_name
         FROM system_settings s LEFT JOIN users u ON u.id = s.updated_by`,
    )
    const changed: SiteSettingsDto['changed'] = {}
    for (const row of rows) {
      const key = row.setting_key as SiteSettingKey
      if (!SITE_SETTING_KEYS.includes(key)) continue
      changed[key] = {
        at: iso(row.updated_at) as string,
        by: row.updated_by
          ? { id: String(row.updated_by), display_name: row.display_name ?? '' }
          : null,
      }
    }
    return { values: await settings.get(), changed }
  }

  routes.get('/settings', async (c) => c.json(await settingsDto()))

  routes.put('/settings', async (c) => {
    const actor = requireSuperAdmin(c)
    const input = await parseBody(c, siteSettingsUpdateSchema)
    const before = await settings.get()
    const keys = (Object.keys(input) as SiteSettingKey[]).filter(
      (key) => JSON.stringify(input[key]) !== JSON.stringify(before[key]),
    )
    if (keys.length > 0) {
      await withTransaction(pool, async (conn) => {
        for (const key of keys) {
          await execute(
            conn,
            `INSERT INTO system_settings (setting_key, value_json, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
            [key, JSON.stringify(input[key]), actor.userId],
          )
        }
        await writeAudit(conn, c, {
          projectId: null,
          entityType: 'system_setting',
          entityId: '0',
          action: 'UPDATE',
          oldValues: Object.fromEntries(keys.map((key) => [key, before[key]])),
          newValues: Object.fromEntries(keys.map((key) => [key, input[key]])),
        })
      })
      settings.invalidate()
    }
    return c.json(await settingsDto())
  })

  // ---- Projects (all of them, archived included) -------------------------------------
  async function adminProjects(projectId?: string): Promise<AdminProjectDto[]> {
    const rows = await select<{
      id: string
      project_code: string
      name: string
      description: string | null
      is_archived: number
      created_at: Date
      created_by: string | null
      creator_name: string | null
      member_count: number
      test_cases: number
      runs: number
      open_defects: number
    }>(
      pool,
      `SELECT p.id, p.project_code, p.name, p.description, p.is_archived, p.created_at,
              p.created_by, u.display_name AS creator_name,
              (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) AS member_count,
              (SELECT COUNT(*) FROM test_cases tc
                WHERE tc.project_id = p.id AND tc.case_status <> 'ARCHIVED') AS test_cases,
              (SELECT COUNT(*) FROM test_runs r WHERE r.project_id = p.id) AS runs,
              (SELECT COUNT(*) FROM defects d WHERE d.project_id = p.id
                  AND d.status_code IN (${OPEN_DEFECT_STATUSES.map(() => '?').join(', ')})) AS open_defects
         FROM projects p LEFT JOIN users u ON u.id = p.created_by
        WHERE (? IS NULL OR p.id = ?)
        ORDER BY p.is_archived, p.project_code`,
      [...OPEN_DEFECT_STATUSES, projectId ?? null, projectId ?? null],
    )
    return rows.map((row) => ({
      id: String(row.id),
      project_code: row.project_code,
      name: row.name,
      description: row.description,
      is_archived: Number(row.is_archived) === 1,
      created_at: iso(row.created_at) as string,
      created_by: row.created_by
        ? { id: String(row.created_by), display_name: row.creator_name ?? '' }
        : null,
      member_count: Number(row.member_count),
      counts: {
        test_cases: Number(row.test_cases),
        runs: Number(row.runs),
        open_defects: Number(row.open_defects),
      },
    }))
  }

  routes.get('/projects', async (c) => c.json(await adminProjects()))

  routes.patch('/projects/:projectId', async (c) => {
    const projectId = idParam(c, 'projectId')
    const input = await parseBody(c, adminProjectUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<{
        project_code: string
        name: string
        description: string | null
        is_archived: number
      }>(
        conn,
        'SELECT project_code, name, description, is_archived FROM projects WHERE id = ? FOR UPDATE',
        [projectId],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      try {
        await execute(
          conn,
          `UPDATE projects SET project_code = COALESCE(?, project_code),
                  name = COALESCE(?, name),
                  description = IF(?, ?, description),
                  is_archived = COALESCE(?, is_archived)
            WHERE id = ?`,
          [
            input.project_code ?? null,
            input.name ?? null,
            input.description !== undefined ? 1 : 0,
            input.description ?? null,
            input.is_archived === undefined ? null : input.is_archived ? 1 : 0,
            projectId,
          ],
        )
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Project code already exists.', [
            { field: 'project_code', message: 'Already used' },
          ])
        }
        throw error
      }
      await writeAudit(conn, c, {
        projectId,
        entityType: 'project',
        entityId: projectId,
        action: input.is_archived === true ? 'ARCHIVE' : 'UPDATE',
        oldValues: {
          project_code: before.project_code,
          name: before.name,
          description: before.description,
          is_archived: Number(before.is_archived) === 1,
        },
        newValues: input,
      })
    })
    const [project] = await adminProjects(projectId)
    return c.json(project)
  })

  // ---- Activity log of the whole website ---------------------------------------------
  routes.get('/audit-logs', async (c) => {
    const query = Object.fromEntries(
      Object.entries(c.req.query()).filter(
        ([key, value]) => value !== '' && key !== 'page' && key !== 'page_size',
      ),
    )
    const f = parseWith(auditFilterSchema, query)
    const { page, pageSize, offset } = pageParams(c)
    const start = f.from ? wibDayStart(f.from) : null
    const end = f.to ? wibDayEnd(f.to) : null
    const project = f.project ?? null
    const where = [
      "(? IS NULL OR (? = 'site' AND a.project_id IS NULL) OR a.project_id = ?)",
      '(? IS NULL OR a.entity_type = ?)',
      '(? IS NULL OR a.action_code = ?)',
      '(? IS NULL OR a.actor_id = ?)',
      '(? IS NULL OR a.created_at >= ?)',
      '(? IS NULL OR a.created_at < ?)',
    ].join(' AND ')
    const params = [
      project,
      project,
      project === 'site' ? null : project,
      f.entity_type ?? null,
      f.entity_type ?? null,
      f.action ?? null,
      f.action ?? null,
      f.actor_id ?? null,
      f.actor_id ?? null,
      start,
      start,
      end,
      end,
    ]
    const total = await selectOne<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM audit_logs a WHERE ${where}`,
      params,
    )
    const rows = await select<AuditLogRow>(
      pool,
      `SELECT a.id, a.created_at, a.actor_id, u.display_name, a.entity_type, a.entity_id,
              a.action_code, a.old_values_json, a.new_values_json, a.request_id,
              a.project_id, p.project_code
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN projects p ON p.id = a.project_id
        WHERE ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    )
    const body: Paginated<AuditLogEntry> = {
      data: await auditEntries(pool, rows, null),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  return routes
}
