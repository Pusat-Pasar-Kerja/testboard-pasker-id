import {
  memberAddSchema,
  memberUpdateSchema,
  type MemberDto,
  type MemberRole,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { execute, iso, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

interface MemberRow {
  user_id: string
  display_name: string
  email: string
  is_active: number
  role_code: MemberRole
  joined_at: Date
}

async function listMembers(db: Db, projectId: string, userId?: string): Promise<MemberDto[]> {
  const rows = await select<MemberRow>(
    db,
    `SELECT u.id AS user_id, u.display_name, u.email, u.is_active, m.role_code, m.joined_at
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
    },
    role_code: row.role_code,
    joined_at: iso(row.joined_at) as string,
  }))
}

/** Never leave a project without an ADMIN (it would become unmanageable). */
async function assertNotLastAdmin(conn: PoolConnection, projectId: string, userId: string) {
  const rows = await select<{ user_id: string }>(
    conn,
    "SELECT user_id FROM project_members WHERE project_id = ? AND role_code = 'ADMIN' FOR UPDATE",
    [projectId],
  )
  if (rows.length === 1 && String(rows[0]?.user_id) === userId) {
    throw new AppError(409, 'CONFLICT', 'A project must keep at least one ADMIN.')
  }
}

export function memberRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('member.read'), async (c) =>
    c.json(await listMembers(pool, c.get('project').id)),
  )

  routes.post('/', requirePermission('member.manage'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, memberAddSchema)
    const user = await selectOne<{ id: string }>(pool, 'SELECT id FROM users WHERE email = ?', [
      input.email,
    ])
    if (!user) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'email', message: 'No account with this e-mail. Ask a Super Admin to create it.' },
      ])
    }
    const userId = String(user.id)
    await withTransaction(pool, async (conn) => {
      const existing = await selectOne(
        conn,
        'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?',
        [project.id, userId],
      )
      if (existing) throw new AppError(409, 'CONFLICT', 'This user is already a member.')
      await execute(
        conn,
        'INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, ?)',
        [project.id, userId, input.role_code],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project_member',
        entityId: userId,
        action: 'CREATE',
        newValues: { role_code: input.role_code },
      })
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
      if (current.role_code === 'ADMIN' && input.role_code !== 'ADMIN') {
        await assertNotLastAdmin(conn, project.id, userId)
      }
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
      if (current.role_code === 'ADMIN') await assertNotLastAdmin(conn, project.id, userId)
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
