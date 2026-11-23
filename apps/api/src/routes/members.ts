import {
  memberAddSchema,
  memberUpdateSchema,
  type MemberDto,
  type MemberRole,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import type { ActivationLinkDto } from '@testboard/shared'
import { findOrCreatePerson } from '../access/people.js'
import { requirePermission } from '../access/project-access.js'
import { execute, iso, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import { requireAuth } from '../auth/middleware.js'
import type { SettingsService } from '../settings/service.js'
import type { AppEnv } from '../types.js'
import { issueActivationLink } from './recovery.js'

interface MemberRow {
  user_id: string
  display_name: string
  email: string
  is_active: number
  has_password: number
  role_code: MemberRole
  joined_at: Date
}

async function listMembers(db: Db, projectId: string, userId?: string): Promise<MemberDto[]> {
  const rows = await select<MemberRow>(
    db,
    `SELECT u.id AS user_id, u.display_name, u.email, u.is_active,
            u.password_hash IS NOT NULL AS has_password, m.role_code, m.joined_at
       FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? AND (? IS NULL OR m.user_id = ?)
      ORDER BY u.display_name`,
    [projectId, userId ?? null, userId ?? null],
  )
  return rows.map((row) => ({
    user: {
      id: String(row.user_id),
      display_name: row.display_name,
      email: row.email,
      is_active: Number(row.is_active) === 1,
      has_password: Number(row.has_password) === 1,
    },
    role_code: row.role_code,
    joined_at: iso(row.joined_at) as string,
  }))
}

/**
 * Project members are Users with one task each (ADR 0017): Penguji, Developer or Pemantau.
 * Admins and Super Admins manage every project through their website role, so there is no
 * longer a "keep at least one ADMIN" rule.
 */
export function memberRoutes(pool: Pool, settings: SettingsService) {
  const routes = new Hono<AppEnv>()

  // An Admin hands a new member the link to choose their password (copy, or WhatsApp).
  routes.post('/:userId/activation-link', requirePermission('member.manage'), async (c) => {
    const project = c.get('project')
    const actor = requireAuth(c)
    const userId = idParam(c, 'userId')
    const hours = (await settings.get())['recovery.link_hours']
    const link = await withTransaction(pool, async (conn) => {
      const member = await selectOne(
        conn,
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
        [project.id, userId],
      )
      if (!member) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      return issueActivationLink(conn, c, {
        userId,
        actorId: actor.userId,
        projectId: project.id,
        hours,
      })
    })
    const body: ActivationLinkDto = { token: link.token, expires_at: iso(link.expiresAt) as string }
    return c.json(body, 201)
  })

  routes.get('/', requirePermission('member.read'), async (c) =>
    c.json(await listMembers(pool, c.get('project').id)),
  )

  routes.post('/', requirePermission('member.manage'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, memberAddSchema)
    const userId = await withTransaction(pool, async (conn) => {
      const person = await findOrCreatePerson(conn, c, input)
      const existing = await selectOne(
        conn,
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
        [project.id, person.userId],
      )
      if (existing) throw new AppError(409, 'CONFLICT', 'This user is already a member.')
      await execute(
        conn,
        'INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, ?)',
        [project.id, person.userId, input.role_code],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project_member',
        entityId: person.userId,
        action: 'CREATE',
        newValues: { role_code: input.role_code, new_account: person.created },
      })
      return person.userId
    })
    const [member] = await listMembers(pool, project.id, userId)
    return c.json(member, 201)
  })

  routes.patch('/:userId', requirePermission('member.manage'), async (c) => {
    const project = c.get('project')
    const userId = idParam(c, 'userId')
    const input = await parseBody(c, memberUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const current = await selectOne<{ role_code: MemberRole }>(
        conn,
        'SELECT role_code FROM project_members WHERE project_id = ? AND user_id = ? FOR UPDATE',
        [project.id, userId],
      )
      if (!current) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      await execute(
        conn,
        'UPDATE project_members SET role_code = ? WHERE project_id = ? AND user_id = ?',
        [input.role_code, project.id, userId],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project_member',
        entityId: userId,
        action: 'UPDATE',
        oldValues: current,
        newValues: input,
      })
    })
    const [member] = await listMembers(pool, project.id, userId)
    return c.json(member)
  })

  routes.delete('/:userId', requirePermission('member.manage'), async (c) => {
    const project = c.get('project')
    const userId = idParam(c, 'userId')
    await withTransaction(pool, async (conn) => {
      const current = await selectOne<{ role_code: MemberRole }>(
        conn,
        'SELECT role_code FROM project_members WHERE project_id = ? AND user_id = ? FOR UPDATE',
        [project.id, userId],
      )
      if (!current) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      await execute(conn, 'DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [
        project.id,
        userId,
      ])
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project_member',
        entityId: userId,
        action: 'DELETE',
        oldValues: current,
      })
    })
    return c.body(null, 204)
  })

  return routes
}
