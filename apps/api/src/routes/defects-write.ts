import {
  canTransitionDefect,
  defectCommentSchema,
  defectCreateSchema,
  defectEditableFields,
  defectLinkSchema,
  defectStatusSchema,
  defectUpdateSchema,
  type DefectActor,
  type DefectCommentDto,
  type DefectField,
  type DefectStatus,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
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
import { AppError } from '../lib/errors.js'
import { IdempotencyStore } from '../lib/idempotency.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import { loadDefectDetail } from './defects.js'

/** DEC-08: reporter and assignee are always members of the project. VIEWER cannot own a bug. */
const ASSIGNABLE_ROLES = ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER']

interface LockedDefect {
  id: string
  bug_code: string
  status_code: DefectStatus
  reported_by: string | null
  assigned_to: string | null
  updated_at: Date
  [field: string]: unknown
}

const invalid = (field: string, message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [{ field, message }])

async function lockDefect(conn: PoolConnection, projectId: string, defectId: string) {
  const row = await selectOne<LockedDefect>(
    conn,
    'SELECT * FROM defects WHERE id = ? AND project_id = ? FOR UPDATE',
    [defectId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

async function assertModule(db: Db, projectId: string, moduleId: string | null | undefined) {
  if (!moduleId) return
  if (
    !(await selectOne(db, 'SELECT 1 FROM modules WHERE id = ? AND project_id = ?', [
      moduleId,
      projectId,
    ]))
  ) {
    throw invalid('module_id', 'Module not found in this project')
  }
}

async function assertAssignee(db: Db, projectId: string, userId: string | null | undefined) {
  if (!userId) return
  const member = await selectOne<{ role_code: string }>(
    db,
    `SELECT m.role_code FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? AND m.user_id = ? AND u.is_active = 1`,
    [projectId, userId],
  )
  if (!member || !ASSIGNABLE_ROLES.includes(member.role_code)) {
    throw invalid('assigned_to', 'Assignee must be an active project member (not a viewer)')
  }
}

/** Every attempt must belong to a run of this project (no cross-project links). */
async function assertExecutions(db: Db, projectId: string, ids: string[]) {
  if (ids.length === 0) return
  const found = await select<{ id: string }>(
    db,
    `SELECT e.id FROM test_executions e
       JOIN test_run_cases trc ON trc.id = e.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
      WHERE r.project_id = ? AND e.id IN (${ids.map(() => '?').join(', ')})`,
    [projectId, ...ids],
  )
  if (found.length !== ids.length)
    throw invalid('execution_ids', 'Test attempt not found in this project')
}

/**
 * Bug code prefix: an explicit project setting, else the prefix already used by this
 * project's bugs (keeps imported/legacy numbering), else BUG-<first 3 letters of the code>.
 */
async function bugPrefix(conn: PoolConnection, projectId: string, projectCode: string) {
  const setting = await selectOne<{ value_json: unknown }>(
    conn,
    "SELECT value_json FROM project_settings WHERE project_id = ? AND setting_key = 'defect.code_prefix'",
    [projectId],
  )
  const configured = parseJson<string>(setting?.value_json)
  if (typeof configured === 'string' && /^[A-Z0-9][A-Z0-9-]{1,40}$/.test(configured))
    return configured
  const last = await selectOne<{ bug_code: string }>(
    conn,
    'SELECT bug_code FROM defects WHERE project_id = ? ORDER BY id DESC LIMIT 1',
    [projectId],
  )
  const existing = last?.bug_code.match(/^(.+)-\d+$/)?.[1]
  if (existing) return existing
  const segment =
    projectCode
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
      .at(-1) ?? 'PRJ'
  return `BUG-${segment.slice(0, 3)}`
}

/** BUG-XXX-0001 under the project row lock, so two reporters never get the same code. */
async function nextBugCode(conn: PoolConnection, projectId: string, projectCode: string) {
  await execute(conn, 'SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId])
  const prefix = await bugPrefix(conn, projectId, projectCode)
  const rows = await select<{ bug_code: string }>(
    conn,
    'SELECT bug_code FROM defects WHERE project_id = ? AND bug_code LIKE ?',
    [projectId, `${prefix.replace(/[\\%_]/g, '\\$&')}-%`],
  )
  const max = rows.reduce((m, r) => {
    const tail = r.bug_code.slice(prefix.length + 1)
    return /^\d+$/.test(tail) ? Math.max(m, Number.parseInt(tail, 10)) : m
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

function actorFor(
  c: Context<AppEnv>,
  row: Pick<LockedDefect, 'reported_by' | 'assigned_to'>,
): DefectActor {
  const userId = c.get('auth')?.userId ?? ''
  return {
    role: c.get('project').role,
    isAssignee: row.assigned_to !== null && String(row.assigned_to) === userId,
    isReporter: row.reported_by !== null && String(row.reported_by) === userId,
  }
}

const sameValue = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '')

export function defectWriteRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()
  const idempotency = new IdempotencyStore()

  routes.post('/', requirePermission('defect.create'), async (c) => {
    const project = c.get('project')
    const userId = c.get('auth')?.userId ?? ''
    const idemKey = IdempotencyStore.key(
      `defect:${project.id}`,
      userId,
      c.req.header('Idempotency-Key'),
    )
    const replay = idemKey ? idempotency.get(idemKey) : null
    if (replay) return c.json(replay.body as object, 201)

    const body = await parseBody(c, defectCreateSchema)
    const isLead = project.role === 'ADMIN' || project.role === 'QA_LEAD'
    if (body.assigned_to && !isLead) {
      throw new AppError(403, 'FORBIDDEN', 'Only an ADMIN or QA_LEAD can assign a bug.', [
        { field: 'assigned_to', message: 'Only an ADMIN or QA_LEAD can assign a bug' },
      ])
    }
    const executionIds = [...new Set(body.execution_ids ?? [])]

    const defectId = await withTransaction(pool, async (conn) => {
      await assertModule(conn, project.id, body.module_id)
      await assertAssignee(conn, project.id, body.assigned_to)
      await assertExecutions(conn, project.id, executionIds)
      const bugCode = body.bug_code ?? (await nextBugCode(conn, project.id, project.code))
      let id: string
      try {
        const result = await execute(
          conn,
          `INSERT INTO defects
             (project_id, module_id, bug_code, title, description, steps_to_reproduce,
              expected_behavior, actual_behavior, severity_code, priority_code, status_code,
              source_kind, environment_name, build_version, browser_name, reported_by,
              assigned_to, fixed_in_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
          [
            project.id,
            body.module_id ?? null,
            bugCode,
            body.title,
            body.description ?? null,
            body.steps_to_reproduce ?? null,
            body.expected_behavior ?? null,
            body.actual_behavior ?? null,
            body.severity_code,
            body.priority_code,
            body.source_kind,
            body.environment_name ?? null,
            body.build_version ?? null,
            body.browser_name ?? null,
            userId,
            body.assigned_to ?? null,
            body.fixed_in_version ?? null,
          ],
        )
        id = insertedId(result)
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'This bug code is already used.', [
            { field: 'bug_code', message: 'Already used' },
          ])
        }
        throw error
      }
      await execute(
        conn,
        `INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by)
         VALUES (?, NULL, 'OPEN', ?)`,
        [id, userId],
      )
      for (const executionId of executionIds) {
        await execute(
          conn,
          'INSERT INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
          [id, executionId],
        )
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: id,
        action: 'CREATE',
        newValues: { ...body, bug_code: bugCode },
      })
      return id
    })

    const created = await loadDefectDetail(pool, project.id, defectId)
    if (idemKey) idempotency.set(idemKey, 201, created)
    return c.json(created, 201)
  })

  routes.patch('/:defectId', requirePermission('defect.update'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    const body = await parseBody(c, defectUpdateSchema)

    await withTransaction(pool, async (conn) => {
      const row = await lockDefect(conn, project.id, defectId)
      if (
        body.expected_updated_at &&
        iso(row.updated_at) !== new Date(body.expected_updated_at).toISOString()
      ) {
        throw new AppError(
          409,
          'CONFLICT',
          'This bug was changed by someone else. Reload to see the latest version.',
        )
      }
      const requested = (Object.keys(body) as (keyof typeof body)[]).filter(
        (key): key is DefectField => key !== 'expected_updated_at' && body[key] !== undefined,
      )
      const allowed = defectEditableFields(actorFor(c, row))
      const forbidden = requested.filter((field) => !allowed.includes(field))
      if (forbidden.length > 0) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'You cannot change these fields of this bug.',
          forbidden.map((field) => ({ field, message: 'Not allowed for your role' })),
        )
      }
      const changed = requested.filter((field) => !sameValue(row[field], body[field]))
      if (changed.length === 0) return
      if (changed.includes('module_id')) await assertModule(conn, project.id, body.module_id)
      if (changed.includes('assigned_to')) await assertAssignee(conn, project.id, body.assigned_to)

      await execute(
        conn,
        `UPDATE defects SET ${changed.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...changed.map((field) => body[field] ?? null), defectId],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: defectId,
        action: 'UPDATE',
        oldValues: Object.fromEntries(changed.map((field) => [field, row[field] ?? null])),
        newValues: Object.fromEntries(changed.map((field) => [field, body[field] ?? null])),
      })
    })
    return c.json(await loadDefectDetail(pool, project.id, defectId))
  })

  routes.post('/:defectId/status', requirePermission('defect.update'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    const body = await parseBody(c, defectStatusSchema)
    const to = body.status_code

    await withTransaction(pool, async (conn) => {
      const row = await lockDefect(conn, project.id, defectId)
      const from = row.status_code
      if (body.expected_status && body.expected_status !== from) {
        throw new AppError(
          409,
          'CONFLICT',
          `The bug is already ${from}. Reload to see the latest status.`,
          [{ field: 'status_code', message: `Current status is ${from}` }],
        )
      }
      // TB-BUG-004: the backend rejects transitions outside the workflow.
      if (!canTransitionDefect(from, to)) {
        throw new AppError(409, 'CONFLICT', `A ${from} bug cannot become ${to}.`, [
          { field: 'status_code', message: `Invalid transition ${from} -> ${to}` },
        ])
      }
      if (!canTransitionDefect(from, to, actorFor(c, row))) {
        throw new AppError(403, 'FORBIDDEN', 'Your role cannot move this bug to that status.')
      }
      const fixVersion =
        (to === 'FIXED' || to === 'READY_FOR_RETEST') && body.fixed_in_version
          ? body.fixed_in_version
          : null
      await execute(
        conn,
        `UPDATE defects
            SET status_code = ?,
                fixed_in_version = COALESCE(?, fixed_in_version),
                resolved_at = CASE WHEN ? = 'FIXED' THEN UTC_TIMESTAMP(3)
                                   WHEN ? = 'REOPENED' THEN NULL ELSE resolved_at END,
                closed_at = CASE WHEN ? IN ('CLOSED', 'WONT_FIX') THEN UTC_TIMESTAMP(3)
                                 WHEN ? = 'REOPENED' THEN NULL ELSE closed_at END
          WHERE id = ?`,
        [to, fixVersion, to, to, to, to, defectId],
      )
      await execute(
        conn,
        `INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by, change_comment)
         VALUES (?, ?, ?, ?, ?)`,
        [defectId, from, to, c.get('auth')?.userId ?? null, body.comment ?? null],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: defectId,
        action: 'STATUS_CHANGE',
        oldValues: { status_code: from },
        newValues: { status_code: to, comment: body.comment ?? null, fixed_in_version: fixVersion },
      })
    })
    return c.json(await loadDefectDetail(pool, project.id, defectId))
  })

  routes.post('/:defectId/comments', requirePermission('defect.comment'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    const body = await parseBody(c, defectCommentSchema)
    const userId = c.get('auth')?.userId ?? ''

    const comment = await withTransaction(pool, async (conn) => {
      await lockDefect(conn, project.id, defectId)
      const result = await execute(
        conn,
        'INSERT INTO defect_comments (defect_id, author_id, body) VALUES (?, ?, ?)',
        [defectId, userId, body.body],
      )
      const id = insertedId(result)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect_comment',
        entityId: id,
        action: 'CREATE',
        newValues: { defect_id: defectId },
      })
      return selectOne<{
        id: string
        author_id: string
        author_name: string
        body: string
        created_at: Date
      }>(
        conn,
        `SELECT cm.id, cm.author_id, u.display_name AS author_name, cm.body, cm.created_at
           FROM defect_comments cm LEFT JOIN users u ON u.id = cm.author_id WHERE cm.id = ?`,
        [id],
      )
    })
    if (!comment) throw new AppError(500, 'INTERNAL_ERROR', 'Comment was not stored.')
    const dto: DefectCommentDto = {
      id: String(comment.id),
      author: { id: String(comment.author_id), display_name: comment.author_name },
      body: comment.body,
      created_at: iso(comment.created_at) as string,
    }
    return c.json(dto, 201)
  })

  routes.post('/:defectId/executions', requirePermission('defect.link'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    const { execution_id: executionId } = await parseBody(c, defectLinkSchema)

    const created = await withTransaction(pool, async (conn) => {
      await lockDefect(conn, project.id, defectId)
      await assertExecutions(conn, project.id, [executionId])
      const result = await execute(
        conn,
        'INSERT IGNORE INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
        [defectId, executionId],
      )
      if (result.affectedRows === 0) return false
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: defectId,
        action: 'UPDATE',
        newValues: { linked_execution_id: executionId },
      })
      return true
    })
    return c.json(await loadDefectDetail(pool, project.id, defectId), created ? 201 : 200)
  })

  routes.delete(
    '/:defectId/executions/:executionId',
    requirePermission('defect.link'),
    async (c) => {
      const project = c.get('project')
      const defectId = idParam(c, 'defectId')
      const executionId = idParam(c, 'executionId')

      await withTransaction(pool, async (conn) => {
        await lockDefect(conn, project.id, defectId)
        const result = await execute(
          conn,
          'DELETE FROM defect_execution_links WHERE defect_id = ? AND execution_id = ?',
          [defectId, executionId],
        )
        if (result.affectedRows === 0) throw new AppError(404, 'NOT_FOUND', 'Not found.')
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'defect',
          entityId: defectId,
          action: 'UPDATE',
          oldValues: { linked_execution_id: executionId },
        })
      })
      return c.json(await loadDefectDetail(pool, project.id, defectId))
    },
  )

  return routes
}
