import {
  OPEN_DEFECT_STATUSES,
  projectCreateSchema,
  projectUpdateSchema,
  type MemberRole,
  type ProjectSummary,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { projectAccess, requirePermission } from '../access/project-access.js'
import { requireAuth, requireSuperAdmin } from '../auth/middleware.js'
import type { FileService } from '../files/pipeline.js'
import {
  execute,
  insertedId,
  isDuplicateKey,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import { cycleRoutes } from './cycles.js'
import { defectRoutes } from './defects.js'
import { executionRoutes } from './executions.js'
import { fileRoutes } from './files.js'
import { defectWriteRoutes } from './defects-write.js'
import { memberRoutes } from './members.js'
import { moduleRoutes } from './modules.js'
import { reportRoutes } from './reports.js'
import { runCaseRoutes } from './run-cases.js'
import { runRoutes } from './runs.js'
import { runWriteRoutes } from './runs-write.js'
import { suiteRoutes } from './suites.js'
import { testCaseRoutes } from './test-cases.js'

interface ProjectRow {
  id: string
  project_code: string
  name: string
  description: string | null
  is_archived: number
  role_code: MemberRole | null
  test_cases: number
  runs: number
  open_defects: number
}

const OPEN_LIST = OPEN_DEFECT_STATUSES.map(() => '?').join(', ')

async function projectRows(
  db: Db,
  userId: string,
  isSuperAdmin: boolean,
  projectId?: string,
): Promise<ProjectSummary[]> {
  const rows = await select<ProjectRow>(
    db,
    `SELECT p.id, p.project_code, p.name, p.description, p.is_archived, m.role_code,
            (SELECT COUNT(*) FROM test_cases tc
              WHERE tc.project_id = p.id AND tc.case_status <> 'ARCHIVED') AS test_cases,
            (SELECT COUNT(*) FROM test_runs r WHERE r.project_id = p.id) AS runs,
            (SELECT COUNT(*) FROM defects d
              WHERE d.project_id = p.id AND d.status_code IN (${OPEN_LIST})) AS open_defects
       FROM projects p
       LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
      WHERE (m.user_id IS NOT NULL OR ? = 1) AND (? IS NULL OR p.id = ?)
      ORDER BY p.is_archived, p.project_code`,
    [...OPEN_DEFECT_STATUSES, userId, isSuperAdmin ? 1 : 0, projectId ?? null, projectId ?? null],
  )
  return rows.map((row) => ({
    id: String(row.id),
    project_code: row.project_code,
    name: row.name,
    description: row.description,
    role_code: row.role_code ?? 'ADMIN',
    is_archived: Number(row.is_archived) === 1,
    counts: {
      test_cases: Number(row.test_cases),
      runs: Number(row.runs),
      open_defects: Number(row.open_defects),
    },
  }))
}

export function projectRoutes(pool: Pool, files: FileService) {
  const routes = new Hono<AppEnv>()

  routes.get('/projects', async (c) => {
    const auth = requireAuth(c)
    return c.json(await projectRows(pool, auth.userId, auth.isSuperAdmin))
  })

  // Creating projects is a website-level action (ADR 0004): Super Admin only.
  routes.post('/projects', async (c) => {
    const auth = requireSuperAdmin(c)
    const input = await parseBody(c, projectCreateSchema)
    const projectId = await withTransaction(pool, async (conn) => {
      try {
        const result = await execute(
          conn,
          'INSERT INTO projects (project_code, name, description, created_by) VALUES (?, ?, ?, ?)',
          [input.project_code, input.name, input.description ?? null, auth.userId],
        )
        const id = insertedId(result)
        await execute(
          conn,
          "INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, 'ADMIN')",
          [id, auth.userId],
        )
        await writeAudit(conn, c, {
          projectId: id,
          entityType: 'project',
          entityId: id,
          action: 'CREATE',
          newValues: input,
        })
        return id
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Project code already exists.', [
            { field: 'project_code', message: 'Already used' },
          ])
        }
        throw error
      }
    })
    const [created] = await projectRows(pool, auth.userId, auth.isSuperAdmin, projectId)
    return c.json(created, 201)
  })

  const scoped = new Hono<AppEnv>()
  scoped.use('*', projectAccess(pool))

  scoped.get('/', requirePermission('project.read'), async (c) => {
    const auth = requireAuth(c)
    const [project] = await projectRows(pool, auth.userId, true, c.get('project').id)
    return c.json({ ...project, role_code: c.get('project').role })
  })

  scoped.patch('/', requirePermission('project.update'), async (c) => {
    const auth = requireAuth(c)
    const project = c.get('project')
    const input = await parseBody(c, projectUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne(
        conn,
        'SELECT name, description, is_archived FROM projects WHERE id = ? FOR UPDATE',
        [project.id],
      )
      await execute(
        conn,
        `UPDATE projects SET name = COALESCE(?, name),
                             description = IF(?, ?, description),
                             is_archived = COALESCE(?, is_archived)
          WHERE id = ?`,
        [
          input.name ?? null,
          input.description !== undefined ? 1 : 0,
          input.description ?? null,
          input.is_archived === undefined ? null : input.is_archived ? 1 : 0,
          project.id,
        ],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project',
        entityId: project.id,
        action: 'UPDATE',
        oldValues: before,
        newValues: input,
      })
    })
    const [updated] = await projectRows(pool, auth.userId, true, project.id)
    return c.json({ ...updated, role_code: project.role })
  })

  scoped.route('/members', memberRoutes(pool))
  scoped.route('/modules', moduleRoutes(pool))
  scoped.route('/suites', suiteRoutes(pool))
  scoped.route('/test-cases', testCaseRoutes(pool))
  scoped.route('/cycles', cycleRoutes(pool))
  scoped.route('/runs', runRoutes(pool))
  scoped.route('/runs', runWriteRoutes(pool))
  scoped.route('/run-cases', runCaseRoutes(pool))
  scoped.route('/defects', defectRoutes(pool))
  scoped.route('/defects', defectWriteRoutes(pool))
  scoped.route('/reports', reportRoutes(pool))
  scoped.route('/files', fileRoutes(pool, files))
  scoped.route('/executions', executionRoutes(pool))

  routes.route('/projects/:projectCode', scoped)
  return routes
}
