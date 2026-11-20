import {
  countStatuses,
  emptyStatusCounts,
  type ExecutionStatus,
  type RunCaseRow,
  type RunStatus,
  type TestRunDetail,
  type TestRunSummary,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { iso, select, type Db } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import { idParam } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

interface RunRow {
  id: string
  run_code: string
  name: string
  environment_name: string | null
  build_version: string | null
  environment_url: string | null
  status_code: RunStatus
  starts_at: Date | null
  ends_at: Date | null
  cycle_id: string | null
  cycle_code: string | null
  cycle_title: string | null
}

/**
 * Run summaries with counts by LATEST attempt per run case (view v_run_case_latest_status),
 * so a retested case is counted once (doc 01 "Prinsip analitik", TB-DASH-001).
 */
export async function runSummaries(
  db: Db,
  projectId: string,
  runId?: string,
): Promise<(TestRunSummary & { environment_url: string | null })[]> {
  const runs = await select<RunRow>(
    db,
    `SELECT r.id, r.run_code, r.name, r.environment_name, r.build_version, r.environment_url,
            r.status_code, r.starts_at, r.ends_at,
            c.id AS cycle_id, c.cycle_code, c.title AS cycle_title
       FROM test_runs r LEFT JOIN test_cycles c ON c.id = r.cycle_id
      WHERE r.project_id = ? AND (? IS NULL OR r.id = ?)
      ORDER BY r.starts_at DESC, r.id DESC`,
    [projectId, runId ?? null, runId ?? null],
  )
  const tallies = await select<{ test_run_id: string; latest_status: ExecutionStatus; n: number }>(
    db,
    `SELECT v.test_run_id, v.latest_status, COUNT(*) AS n
       FROM v_run_case_latest_status v JOIN test_runs r ON r.id = v.test_run_id
      WHERE r.project_id = ? AND (? IS NULL OR r.id = ?)
      GROUP BY v.test_run_id, v.latest_status`,
    [projectId, runId ?? null, runId ?? null],
  )
  return runs.map((run) => {
    const counts = emptyStatusCounts()
    for (const t of tallies) {
      if (String(t.test_run_id) === String(run.id)) counts[t.latest_status] += Number(t.n)
    }
    return {
      id: String(run.id),
      run_code: run.run_code,
      name: run.name,
      cycle: run.cycle_id
        ? {
            id: String(run.cycle_id),
            cycle_code: run.cycle_code ?? '',
            title: run.cycle_title ?? '',
          }
        : null,
      environment_name: run.environment_name,
      environment_url: run.environment_url,
      build_version: run.build_version,
      status_code: run.status_code,
      starts_at: iso(run.starts_at),
      ends_at: iso(run.ends_at),
      total_cases: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
    }
  })
}

/** Read-only run endpoints (writes - create run, execute, retest - arrive in Milestone 3). */
export function runRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('project.read'), async (c) => {
    const runs = await runSummaries(pool, c.get('project').id)
    return c.json(runs.map(({ environment_url: _url, ...summary }) => summary))
  })

  routes.get('/:runId', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const [run] = await runSummaries(pool, project.id, runId)
    if (!run) throw new AppError(404, 'NOT_FOUND', 'Not found.')

    const rows = await select<{
      run_case_id: string
      test_case_id: string
      case_code: string
      title: string
      module_code: string | null
      case_version: number
      assigned_to: string | null
      assignee_name: string | null
      latest_status: ExecutionStatus
      last_tested_at: Date | null
      attempts: number
    }>(
      pool,
      // Title comes from the snapshot frozen when the case joined the run (doc 02).
      `SELECT trc.id AS run_case_id, trc.test_case_id, tc.case_code,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(trc.case_snapshot_json, '$.title')), tc.title) AS title,
              m.module_code, trc.case_version, trc.assigned_to, u.display_name AS assignee_name,
              v.latest_status, v.last_tested_at,
              (SELECT COUNT(*) FROM test_executions e WHERE e.run_case_id = trc.id) AS attempts
         FROM test_run_cases trc
         JOIN test_cases tc ON tc.id = trc.test_case_id
         JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
         LEFT JOIN modules m ON m.id = tc.module_id
         LEFT JOIN users u ON u.id = trc.assigned_to
        WHERE trc.test_run_id = ?
        ORDER BY trc.sort_order, trc.id`,
      [runId],
    )
    const bugs = await select<{ run_case_id: string; bug_code: string }>(
      pool,
      `SELECT DISTINCT e.run_case_id, d.bug_code
         FROM defect_execution_links l
         JOIN test_executions e ON e.id = l.execution_id
         JOIN test_run_cases trc ON trc.id = e.run_case_id
         JOIN defects d ON d.id = l.defect_id
        WHERE trc.test_run_id = ? AND d.project_id = ?
        ORDER BY d.bug_code`,
      [runId, project.id],
    )
    const runCases: RunCaseRow[] = rows.map((row) => ({
      run_case_id: String(row.run_case_id),
      test_case_id: String(row.test_case_id),
      case_code: row.case_code,
      title: row.title,
      module_code: row.module_code,
      case_version: Number(row.case_version),
      assigned_to: row.assigned_to
        ? { id: String(row.assigned_to), display_name: row.assignee_name ?? '' }
        : null,
      latest_status: row.latest_status,
      attempts: Number(row.attempts),
      last_tested_at: iso(row.last_tested_at),
      defect_codes: bugs
        .filter((b) => String(b.run_case_id) === String(row.run_case_id))
        .map((b) => b.bug_code),
    }))
    const detail: TestRunDetail = {
      ...run,
      counts: countStatuses(runCases.map((r) => r.latest_status)),
      run_cases: runCases,
    }
    return c.json(detail)
  })

  return routes
}
