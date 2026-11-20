import { isOneOf, MEMBER_ROLES, roleCan, type MemberRole, type Permission } from '@testboard/shared'
import type { MiddlewareHandler } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requireAuth } from '../auth/middleware.js'
import { selectOne } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import type { AppEnv, ProjectAccess } from '../types.js'

const isRole = isOneOf(MEMBER_ROLES)

/**
 * Resolve `:projectCode` for the signed-in user. A project the user is not a member of
 * answers 404 exactly like a missing one (TB-RBAC-002: no data leak, no existence leak).
 * Super Admin (ADR 0004) gets ADMIN-level access to every project.
 */
export function projectAccess(pool: Pool): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = requireAuth(c)
    const code = (c.req.param('projectCode') ?? '').toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9_.-]{0,39}$/.test(code))
      throw new AppError(404, 'NOT_FOUND', 'Not found.')

    const row = await selectOne<{
      id: string
      project_code: string
      name: string
      role_code: string | null
    }>(
      pool,
      `SELECT p.id, p.project_code, p.name, m.role_code
         FROM projects p
         LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
        WHERE p.project_code = ?`,
      [auth.userId, code],
    )
    const memberRole = row && isRole(row.role_code) ? row.role_code : null
    if (!row || (!memberRole && !auth.isSuperAdmin)) {
      throw new AppError(404, 'NOT_FOUND', 'Not found.')
    }
    const access: ProjectAccess = {
      id: String(row.id),
      code: row.project_code,
      name: row.name,
      role: auth.isSuperAdmin ? 'ADMIN' : (memberRole as MemberRole),
      viaSuperAdmin: auth.isSuperAdmin && memberRole !== 'ADMIN',
    }
    c.set('project', access)
    await next()
  }
}

/** Route guard: 403 when the caller's role lacks the permission (doc 09 matrix). */
export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const project = c.get('project')
    if (!roleCan(project.role, permission)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    }
    await next()
  }
}
