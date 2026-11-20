import {
  canTransitionRun,
  runCasesAddSchema,
  runCasesAssignSchema,
  runCreateSchema,
  runStatusSchema,
  runUpdateSchema,
  stepsFromText,
  type CaseSnapshot,
  type Locale,
  type RunStatus,
  type TestCasePriority,
  type TestType,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
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
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import { runSummaries } from './runs.js'

const EXECUTING_ROLES = ['ADMIN', 'QA_LEAD', 'TESTER']

async function lockRun(conn: PoolConnection, projectId: string, runId: string) {
  const run = await selectOne<{ id: string; status_code: RunStatus; starts_at: Date | null }>(
    conn,
    'SELECT id, status_code, starts_at FROM test_runs WHERE id = ? AND project_id = ? FOR UPDATE',
    [runId, projectId],
  )
  if (!run) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return run
}

function assertEditable(status: RunStatus, allowCompleted = false) {
  if (status === 'LOCKED' || (status === 'COMPLETED' && !allowCompleted)) {
    throw new AppError(409, 'CONFLICT', `The run is ${status.toLowerCase()} and cannot be changed.`)
  }
}

async function assertCycle(db: Db, projectId: string, cycleId: string | null | undefined) {
  if (!cycleId) return
  if (
    !(await selectOne(db, 'SELECT 1 FROM test_cycles WHERE id = ? AND project_id = ?', [
      cycleId,
      projectId,
    ]))
  ) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'cycle_id', message: 'Cycle not found in this project' },
    ])
  }
}

/** Assignee must be a member who is allowed to execute tests (doc 09). */
async function assertAssignee(db: Db, projectId: string, userId: string | null | undefined) {
  if (!userId) return
  const member = await selectOne<{ role_code: string }>(
    db,
    `SELECT m.role_code FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? AND m.user_id = ? AND u.is_active = 1`,
    [projectId, userId],
  )
  if (!member || !EXECUTING_ROLES.includes(member.role_code)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      {
        field: 'assigned_to',
        message: 'Assignee must be an active ADMIN, QA_LEAD or TESTER member',
      },
    ])
  }
}

/** RUN-YYYYMMDD-N, generated under the project row lock (unique under concurrency). */
export async function nextRunCode(conn: PoolConnection, projectId: string) {
  await execute(conn, 'SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId])
  const prefix = `RUN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`
  const rows = await select<{ run_code: string }>(
    conn,
    'SELECT run_code FROM test_runs WHERE project_id = ? AND run_code LIKE ?',
    [projectId, `${prefix}%`],
  )
  const max = rows.reduce(
    (m, r) => Math.max(m, Number.parseInt(r.run_code.slice(prefix.length), 10) || 0),
    0,
  )
  return `${prefix}${max + 1}`
}

interface CaseRow {
  id: string
  case_code: string
  title: string
  module_code: string | null
  category: string | null
  priority_code: TestCasePriority
  test_type_code: TestType
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  expected_result: string | null
  source_locale: Locale
  case_status: string
  current_version: number
}

export function snapshotOf(row: CaseRow): CaseSnapshot {
  return {
    case_code: row.case_code,
    title: row.title,
    version: Number(row.current_version),
    module_code: row.module_code,
    category: row.category,
    priority_code: row.priority_code,
    test_type_code: row.test_type_code,
    actor_label: row.actor_label,
    preconditions: row.preconditions,
    test_steps_text: row.test_steps_text,
    steps: stepsFromText(row.test_steps_text),
    expected_result: row.expected_result,
  }
}

const RUN_FIELDS = [
  'name',
  'cycle_id',
  'environment_name',
  'build_version',
  'environment_url',
  'starts_at',
  'ends_at',
] as const

export function runWriteRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.post('/', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, runCreateSchema)
    await assertCycle(pool, project.id, input.cycle_id)
    const runId = await withTransaction(pool, async (conn) => {
      const code = input.run_code ?? (await nextRunCode(conn, project.id))
      try {
        const result = await execute(
          conn,
          `INSERT INTO test_runs (project_id, cycle_id, run_code, name, environment_name, build_version,
                                  environment_url, starts_at, ends_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            project.id,
            input.cycle_id ?? null,
            code,
            input.name,
            input.environment_name ?? null,
            input.build_version ?? null,
            input.environment_url ?? null,
            input.starts_at ? new Date(input.starts_at) : null,
            input.ends_at ? new Date(input.ends_at) : null,
            c.get('auth')?.userId ?? null,
          ],
        )
        const id = insertedId(result)
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_run',
          entityId: id,
          action: 'CREATE',
          newValues: { ...input, run_code: code },
        })
        return id
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Run code already exists in this project.', [
            { field: 'run_code', message: 'Already used' },
          ])
        }
        throw error
      }
    })
    const [created] = await runSummaries(pool, project.id, runId)
    return c.json(created, 201)
  })

  routes.patch('/:runId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const input = await parseBody(c, runUpdateSchema)
    await assertCycle(pool, project.id, input.cycle_id)
    const columns = RUN_FIELDS.filter((col) => input[col] !== undefined)
    await withTransaction(pool, async (conn) => {
      const run = await lockRun(conn, project.id, runId)
      assertEditable(run.status_code, true)
      if (columns.length > 0) {
        await execute(
          conn,
          // Column names come from the fixed allowlist above, never from the request.
          `UPDATE test_runs SET ${columns.map((col) => `${col} = ?`).join(', ')} WHERE id = ?`,
          [
            ...columns.map((col) => {
              const value = input[col]
              return (col === 'starts_at' || col === 'ends_at') && value
                ? new Date(value)
                : (value ?? null)
            }),
            runId,
          ],
        )
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'UPDATE',
        newValues: input,
      })
    })
    const [updated] = await runSummaries(pool, project.id, runId)
    return c.json(updated)
  })

  routes.post('/:runId/status', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const { status_code: to } = await parseBody(c, runStatusSchema)
    await withTransaction(pool, async (conn) => {
      const run = await lockRun(conn, project.id, runId)
      if (!canTransitionRun(run.status_code, to)) {
        throw new AppError(409, 'CONFLICT', `A ${run.status_code} run cannot become ${to}.`, [
          { field: 'status_code', message: `Invalid transition ${run.status_code} -> ${to}` },
        ])
      }
      await execute(
        conn,
        `UPDATE test_runs SET status_code = ?,
                starts_at = CASE WHEN ? = 'ACTIVE' AND starts_at IS NULL THEN UTC_TIMESTAMP(3) ELSE starts_at END,
                ends_at = CASE WHEN ? = 'COMPLETED' THEN UTC_TIMESTAMP(3)
                               WHEN ? = 'ACTIVE' THEN NULL ELSE ends_at END
          WHERE id = ?`,
        [to, to, to, to, runId],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'STATUS_CHANGE',
        oldValues: { status_code: run.status_code },
        newValues: { status_code: to },
      })
    })
    const [updated] = await runSummaries(pool, project.id, runId)
    return c.json(updated)
  })

  routes.post('/:runId/cases', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const input = await parseBody(c, runCasesAddSchema)
    await assertAssignee(pool, project.id, input.assigned_to)
    const outcome = await withTransaction(pool, async (conn) => {
      const run = await lockRun(conn, project.id, runId)
      assertEditable(run.status_code)
      const ids = [...new Set(input.test_case_ids)]
      const cases = await select<CaseRow>(
        conn,
        `SELECT tc.*, m.module_code FROM test_cases tc LEFT JOIN modules m ON m.id = tc.module_id
          WHERE tc.project_id = ? AND tc.id IN (${ids.map(() => '?').join(', ')})`,
        [project.id, ...ids],
      )
      const existing = new Set(
        (
          await select<{ test_case_id: string }>(
            conn,
            'SELECT test_case_id FROM test_run_cases WHERE test_run_id = ?',
            [runId],
          )
        ).map((r) => String(r.test_case_id)),
      )
      const maxOrder = await selectOne<{ m: number | null }>(
        conn,
        'SELECT MAX(sort_order) AS m FROM test_run_cases WHERE test_run_id = ?',
        [runId],
      )
      let order = Number(maxOrder?.m ?? 0)
      const skipped: {
        test_case_id: string
        reason: 'NOT_FOUND' | 'NOT_READY' | 'ALREADY_IN_RUN'
      }[] = []
      const added: string[] = []
      for (const id of ids) {
        const row = cases.find((cs) => String(cs.id) === id)
        if (!row) skipped.push({ test_case_id: id, reason: 'NOT_FOUND' })
        else if (row.case_status !== 'READY')
          skipped.push({ test_case_id: id, reason: 'NOT_READY' })
        else if (existing.has(id)) skipped.push({ test_case_id: id, reason: 'ALREADY_IN_RUN' })
        else {
          order += 1
          // Freeze the definition now: later edits of the case never change this run.
          await execute(
            conn,
            `INSERT INTO test_run_cases (test_run_id, test_case_id, assigned_to, case_version, case_snapshot_json, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              runId,
              id,
              input.assigned_to ?? null,
              row.current_version,
              JSON.stringify(snapshotOf(row)),
              order,
            ],
          )
          added.push(row.case_code)
        }
      }
      if (added.length > 0) {
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_run',
          entityId: runId,
          action: 'UPDATE',
          newValues: { added_cases: added, assigned_to: input.assigned_to ?? null },
        })
      }
      return { added: added.length, skipped }
    })
    return c.json(outcome, outcome.added > 0 ? 201 : 200)
  })

  routes.delete('/:runId/cases/:runCaseId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const runCaseId = idParam(c, 'runCaseId')
    await withTransaction(pool, async (conn) => {
      const run = await lockRun(conn, project.id, runId)
      assertEditable(run.status_code)
      const row = await selectOne<{ test_case_id: string; attempts: number }>(
        conn,
        `SELECT trc.test_case_id, (SELECT COUNT(*) FROM test_executions e WHERE e.run_case_id = trc.id) AS attempts
           FROM test_run_cases trc WHERE trc.id = ? AND trc.test_run_id = ? FOR UPDATE`,
        [runCaseId, runId],
      )
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      if (Number(row.attempts) > 0) {
        throw new AppError(
          409,
          'CONFLICT',
          'This case already has test results and cannot be removed from the run.',
        )
      }
      await execute(conn, 'DELETE FROM test_run_cases WHERE id = ?', [runCaseId])
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'UPDATE',
        oldValues: { removed_test_case_id: String(row.test_case_id) },
      })
    })
    return c.body(null, 204)
  })

  routes.patch('/:runId/cases/assign', requirePermission('run.assign'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const input = await parseBody(c, runCasesAssignSchema)
    await assertAssignee(pool, project.id, input.assigned_to)
    const updated = await withTransaction(pool, async (conn) => {
      const run = await lockRun(conn, project.id, runId)
      assertEditable(run.status_code, true)
      const ids = [...new Set(input.run_case_ids)]
      const result = await execute(
        conn,
        `UPDATE test_run_cases SET assigned_to = ?
          WHERE test_run_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
        [input.assigned_to, runId, ...ids],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'UPDATE',
        newValues: { assigned_to: input.assigned_to, run_case_ids: ids },
      })
      return result.affectedRows
    })
    return c.json({ updated })
  })

  return routes
}
