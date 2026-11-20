import {
  emptySeverityCounts,
  emptyStatusCounts,
  EXECUTION_STATUSES,
  OPEN_DEFECT_STATUSES,
  type DashboardSummary,
  type DefectSeverity,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { select } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import type { AppEnv } from '../types.js'
import { recentDefects } from './defects.js'
import { runSummaries } from './runs.js'

/** Dashboard aggregates: latest status per run case only; never per attempt (TB-DASH-001). */
export function reportRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/summary', requirePermission('report.read'), async (c) => {
    const project = c.get('project')
    const runIdParam = c.req.query('run_id')
    const runId = runIdParam && /^\d{1,20}$/.test(runIdParam) ? runIdParam : undefined
    const runs = await runSummaries(pool, project.id)
    const scoped = runId ? runs.filter((r) => r.id === runId) : runs
    if (runId && scoped.length === 0) throw new AppError(404, 'NOT_FOUND', 'Not found.')

    const counts = emptyStatusCounts()
    for (const run of scoped) for (const s of EXECUTION_STATUSES) counts[s] += run.counts[s]

    const bySeverity = emptySeverityCounts()
    const severityRows = await select<{ severity_code: DefectSeverity; n: number }>(
      pool,
      `SELECT severity_code, COUNT(*) AS n FROM defects
        WHERE project_id = ? AND status_code IN (${OPEN_DEFECT_STATUSES.map(() => '?').join(', ')})
        GROUP BY severity_code`,
      [project.id, ...OPEN_DEFECT_STATUSES],
    )
    for (const row of severityRows) {
      if (row.severity_code in bySeverity) bySeverity[row.severity_code] = Number(row.n)
    }
    const openDefects = Object.values(bySeverity).reduce((a, b) => a + b, 0)

    const summary: DashboardSummary = {
      project_code: project.code,
      run_id: runId ?? null,
      total_run_cases: scoped.reduce((sum, r) => sum + r.total_cases, 0),
      counts,
      open_defects: openDefects,
      critical_high_open_defects: bySeverity.CRITICAL + bySeverity.HIGH,
      open_defects_by_severity: bySeverity,
      runs: runs.map(({ environment_url: _url, ...summary }) => summary),
      recent_defects: await recentDefects(pool, project.id, 5),
    }
    return c.json(summary)
  })

  return routes
}
