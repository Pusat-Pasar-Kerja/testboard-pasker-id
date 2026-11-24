import {
  executionCreateSchema,
  type CaseSnapshot,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionCreateInput,
  type ExecutionDto,
  type ExecutionKind,
  type ExecutionStatus,
  type RunCaseDetail,
  type RunStatus,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { assertAttachable, linkFiles } from '../files/attach.js'
import { attachedFiles } from '../files/dto.js'
import {
  execute,
  insertedId,
  iso,
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
import { assertParticipantCase, assertRunCaseAccess } from '../uat/service.js'

interface RunCaseRow {
  run_case_id: string
  test_case_id: string
  case_version: number
  current_version: number
  case_snapshot_json: unknown
  assigned_to: string | null
  assignee_name: string | null
  sort_order: number
  run_id: string
  run_code: string
  run_name: string
  run_status: RunStatus
  environment_name: string | null
  build_version: string | null
  environment_url: string | null
  case_code: string
  title: string
  expected_result: string | null
}

async function loadRunCase(db: Db, projectId: string, runCaseId: string) {
  const row = await selectOne<RunCaseRow>(
    db,
    `SELECT trc.id AS run_case_id, trc.test_case_id, trc.case_version, tc.current_version,
            trc.case_snapshot_json, trc.assigned_to, u.display_name AS assignee_name, trc.sort_order,
            r.id AS run_id, r.run_code, r.name AS run_name, r.status_code AS run_status,
            r.environment_name, r.build_version, r.environment_url,
            tc.case_code, tc.title, tc.expected_result
       FROM test_run_cases trc
       JOIN test_runs r ON r.id = trc.test_run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
       LEFT JOIN users u ON u.id = trc.assigned_to
      WHERE trc.id = ? AND r.project_id = ?`,
    [runCaseId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

/** Snapshot frozen at add time; older rows (e.g. imported) fall back to the live case. */
function snapshotFor(row: RunCaseRow): CaseSnapshot {
  const stored = parseJson<Partial<CaseSnapshot>>(row.case_snapshot_json) ?? {}
  return {
    case_code: stored.case_code ?? row.case_code,
    title: stored.title ?? row.title,
    version: stored.version ?? Number(row.case_version),
    module_code: stored.module_code ?? null,
    category: stored.category ?? null,
    priority_code: stored.priority_code ?? 'MUST_HAVE',
    test_type_code: stored.test_type_code ?? 'POSITIVE',
    actor_label: stored.actor_label ?? null,
    preconditions: stored.preconditions ?? null,
    test_steps_text: stored.test_steps_text ?? null,
    steps: stored.steps ?? [],
    expected_result: stored.expected_result ?? row.expected_result,
  }
}

export async function listExecutions(db: Db, runCaseId: string): Promise<ExecutionDto[]> {
  const rows = await select<{
    id: string
    attempt_number: number
    execution_kind: ExecutionKind
    result_status: ExecutionStatus
    actual_result: string | null
    notes: string | null
    tester_id: string | null
    tester_name: string | null
    legacy_tester_name: string | null
    tested_at: Date | null
    browser_name: string | null
    device_name: string | null
    operating_system: string | null
  }>(
    db,
    `SELECT e.*, u.display_name AS tester_name
       FROM test_executions e LEFT JOIN users u ON u.id = e.tester_id
      WHERE e.run_case_id = ? ORDER BY e.attempt_number DESC`,
    [runCaseId],
  )
  const steps = rows.length
    ? await select<{
        execution_id: string
        step_number: number
        result_status: ExecutionStatus
        actual_result: string | null
      }>(
        db,
        `SELECT es.execution_id, s.step_number, es.result_status, es.actual_result
           FROM test_execution_steps es JOIN test_case_steps s ON s.id = es.test_case_step_id
          WHERE es.execution_id IN (${rows.map(() => '?').join(', ')})
          ORDER BY s.step_number`,
        rows.map((r) => r.id),
      )
    : []
  const files = await attachedFiles(
    db,
    'execution',
    rows.map((r) => String(r.id)),
  )
  return rows.map((row) => ({
    id: String(row.id),
    attempt_number: Number(row.attempt_number),
    execution_kind: row.execution_kind,
    result_status: row.result_status,
    actual_result: row.actual_result,
    notes: row.notes,
    tester: row.tester_id
      ? { id: String(row.tester_id), display_name: row.tester_name ?? '' }
      : null,
    legacy_tester_name: row.legacy_tester_name,
    tested_at: iso(row.tested_at),
    browser_name: row.browser_name,
    device_name: row.device_name,
    operating_system: row.operating_system,
    step_results: steps
      .filter((s) => String(s.execution_id) === String(row.id))
      .map((s) => ({
        step_number: Number(s.step_number),
        result_status: s.result_status,
        actual_result: s.actual_result,
      })),
    files: files.get(String(row.id)) ?? [],
  }))
}

export interface ExecutionActor {
  userId: string | null
  /** Leads (and workshop tables for their own features) may record any case of the run. */
  anyCase: boolean
  /** Name typed on a workshop table device (text only, never an account). */
  testerName?: string | null
}

/**
 * Record one attempt inside the caller's transaction (TB-EXEC-001..004, TB-RUN-002). The run
 * case row is locked so two testers saving at the same moment get attempt N and N+1, never the
 * same number. Tester and time always come from the server, never from the request body.
 */
export async function recordExecution(
  conn: Db,
  c: Context<AppEnv>,
  project: { id: string },
  runCaseId: string,
  input: ExecutionCreateInput,
  actor: ExecutionActor,
): Promise<string> {
  // Lock only this run case row (a JOIN ... FOR UPDATE would lock the whole run as well).
  await execute(conn, 'SELECT id FROM test_run_cases WHERE id = ? FOR UPDATE', [runCaseId])
  const row = await loadRunCase(conn, project.id, runCaseId)
  if (row.run_status !== 'ACTIVE') {
    throw new AppError(409, 'CONFLICT', 'Tests can only be recorded while the run is ACTIVE.')
  }
  if (!actor.anyCase && String(row.assigned_to) !== actor.userId) {
    throw new AppError(403, 'FORBIDDEN', 'This test case is assigned to someone else.')
  }
  const snapshot = snapshotFor(row)
  await assertAttachable(conn, project.id, input.evidence ?? [])
  for (const step of input.step_results ?? []) {
    if (step.step_number > Math.max(snapshot.steps.length, 1)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        {
          field: 'step_results',
          message: `Step ${step.step_number} does not exist in this run's snapshot`,
        },
      ])
    }
  }
  const next = await selectOne<{ n: number }>(
    conn,
    'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n FROM test_executions WHERE run_case_id = ?',
    [runCaseId],
  )
  const attempt = Number(next?.n ?? 1)
  const kind: ExecutionKind = attempt === 1 ? 'INITIAL' : (input.execution_kind ?? 'RETEST')
  const result = await execute(
    conn,
    `INSERT INTO test_executions (run_case_id, attempt_number, execution_kind, result_status, actual_result,
                                  notes, tester_id, legacy_tester_name, tested_at, browser_name, device_name, operating_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?)`,
    [
      runCaseId,
      attempt,
      kind,
      input.result_status,
      input.actual_result ?? null,
      input.notes ?? null,
      actor.userId,
      actor.testerName ?? null,
      input.browser_name ?? null,
      input.device_name ?? null,
      input.operating_system ?? null,
    ],
  )
  const id = insertedId(result)

  for (const step of input.step_results ?? []) {
    // Step rows are anchors keyed by number; meaning comes from the run snapshot (ADR 0006).
    const anchor = await execute(
      conn,
      `INSERT INTO test_case_steps (test_case_id, step_number, instruction) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        row.test_case_id,
        step.step_number,
        snapshot.steps[step.step_number - 1]?.instruction ?? `Step ${step.step_number}`,
      ],
    )
    await execute(
      conn,
      'INSERT INTO test_execution_steps (execution_id, test_case_step_id, result_status, actual_result) VALUES (?, ?, ?, ?)',
      [id, insertedId(anchor), step.result_status, step.actual_result ?? null],
    )
  }
  if (input.evidence?.length) await linkFiles(conn, 'execution', id, input.evidence)
  await writeAudit(conn, c, {
    projectId: project.id,
    entityType: 'test_execution',
    entityId: id,
    action: 'CREATE',
    newValues: {
      run_case_id: runCaseId,
      case_code: snapshot.case_code,
      attempt_number: attempt,
      execution_kind: kind,
      result_status: input.result_status,
      evidence_file_ids: (input.evidence ?? []).map((e) => e.file_id),
    },
  })
  return id
}

export function runCaseRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()
  const idempotency = new IdempotencyStore()

  routes.get('/:runCaseId', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    await assertRunCaseAccess(c, pool, idParam(c, 'runCaseId'))
    const row = await loadRunCase(pool, project.id, idParam(c, 'runCaseId'))
    const [attempts, defects, siblings] = await Promise.all([
      listExecutions(pool, row.run_case_id),
      select<{
        id: string
        bug_code: string
        title: string
        status_code: DefectStatus
        severity_code: DefectSeverity
      }>(
        pool,
        `SELECT DISTINCT d.id, d.bug_code, d.title, d.status_code, d.severity_code
           FROM defect_execution_links l
           JOIN test_executions e ON e.id = l.execution_id
           JOIN defects d ON d.id = l.defect_id
          WHERE e.run_case_id = ? AND d.project_id = ?
          ORDER BY d.bug_code`,
        [row.run_case_id, project.id],
      ),
      select<{ id: string }>(
        pool,
        'SELECT id FROM test_run_cases WHERE test_run_id = ? ORDER BY sort_order, id',
        [row.run_id],
      ),
    ])
    const index = siblings.findIndex((s) => String(s.id) === String(row.run_case_id))
    const detail: RunCaseDetail = {
      run_case_id: String(row.run_case_id),
      test_case_id: String(row.test_case_id),
      run: {
        id: String(row.run_id),
        run_code: row.run_code,
        name: row.run_name,
        status_code: row.run_status,
        environment_name: row.environment_name,
        build_version: row.build_version,
        environment_url: row.environment_url,
      },
      case_version: Number(row.case_version),
      current_case_version: Number(row.current_version),
      snapshot: snapshotFor(row),
      assigned_to: row.assigned_to
        ? { id: String(row.assigned_to), display_name: row.assignee_name ?? '' }
        : null,
      latest_status: attempts[0]?.result_status ?? 'NOT_RUN',
      attempts,
      linked_defects: defects.map((d) => ({ ...d, id: String(d.id) })),
      previous_run_case_id: index > 0 ? String(siblings[index - 1]?.id) : null,
      next_run_case_id:
        index >= 0 && index < siblings.length - 1 ? String(siblings[index + 1]?.id) : null,
    }
    return c.json(detail)
  })

  routes.get('/:runCaseId/executions', requirePermission('project.read'), async (c) => {
    await assertRunCaseAccess(c, pool, idParam(c, 'runCaseId'))
    const row = await loadRunCase(pool, c.get('project').id, idParam(c, 'runCaseId'))
    return c.json(await listExecutions(pool, row.run_case_id))
  })

  /**
   * Record one attempt (TB-EXEC-001..004, TB-RUN-002). The run case row is locked so two
   * testers saving at the same moment get attempt N and N+1, never the same number.
   * Tester and time always come from the server, never from the request body.
   */
  routes.post('/:runCaseId/executions', requirePermission('execution.run'), async (c) => {
    const project = c.get('project')
    const auth = c.get('auth')
    const runCaseId = idParam(c, 'runCaseId')
    const idemKey = IdempotencyStore.key(
      `exec:${runCaseId}`,
      auth?.userId ?? '',
      c.req.header('Idempotency-Key'),
    )
    const replay = idemKey ? idempotency.get(idemKey) : null
    if (replay) return c.json(replay.body as ExecutionDto, replay.status as 201)

    const input = await parseBody(c, executionCreateSchema)
    // A Pengguna answers the scenarios of their own UAT and group (ADR 0019); the old
    // per-scenario assignment no longer limits them.
    await assertParticipantCase(c, pool, runCaseId)
    const executionId = await withTransaction(pool, (conn) =>
      recordExecution(conn, c, project, runCaseId, input, {
        userId: auth?.userId ?? null,
        anyCase: true,
      }),
    )
    const created = (await listExecutions(pool, runCaseId)).find((e) => e.id === executionId)
    if (idemKey) idempotency.set(idemKey, 201, created)
    return c.json(created, 201)
  })

  return routes
}
