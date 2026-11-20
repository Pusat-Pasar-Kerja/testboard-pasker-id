import {
  auditChanges,
  auditFilterSchema,
  buildXlsx,
  CSV_MIME,
  emptySeverityCounts,
  emptyStatusCounts,
  EXECUTION_STATUSES,
  OPEN_DEFECT_STATUSES,
  REPORT_SHEET_NAMES,
  reportExportSchema,
  reportFileName,
  reportFilterSchema,
  reportTable,
  toCsv,
  wibDayEnd,
  wibDayStart,
  XLSX_MIME,
  type AuditLogEntry,
  type DashboardSummary,
  type DefectSeverity,
  type Paginated,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { deflateRawSync } from 'node:zlib'
import { requirePermission } from '../access/project-access.js'
import { iso, parseJson, select, selectOne } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { pageParams, parseWith } from '../lib/validation.js'
import { reportOverview, reportRecords } from '../reports/queries.js'
import type { AppEnv } from '../types.js'
import { recentDefects } from './defects.js'
import { runSummaries } from './runs.js'

/** Query string without empty values (an empty filter means "all"). */
function queryOf(query: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== ''))
}

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

  /** Report screen aggregates for the chosen filters (S09). */
  routes.get('/overview', requirePermission('report.read'), async (c) => {
    const project = c.get('project')
    const filter = parseWith(reportFilterSchema, queryOf(c.req.query()))
    return c.json(await reportOverview(pool, project, filter))
  })

  /** CSV/XLSX export of one dataset with the same filters (TB-REPORT-001); audited. */
  routes.get('/export', requirePermission('report.export'), async (c) => {
    const project = c.get('project')
    const { dataset, format, locale, ...filter } = parseWith(
      reportExportSchema,
      queryOf(c.req.query()),
    )
    const records = await reportRecords(pool, project.id, dataset, filter)
    const table = reportTable(dataset, records, locale)
    const name = reportFileName(project.code, dataset, format)

    await writeAudit(pool, c, {
      projectId: project.id,
      entityType: 'report',
      entityId: project.id,
      action: 'EXPORT',
      newValues: { dataset, format, filters: filter, rows: records.length },
    })

    c.header('Content-Disposition', `attachment; filename="${name}"`)
    c.header('X-Content-Type-Options', 'nosniff')
    if (format === 'csv') {
      c.header('Content-Type', CSV_MIME)
      return c.body(toCsv(table.header, table.rows))
    }
    const bytes = buildXlsx(
      [{ name: REPORT_SHEET_NAMES[dataset][locale], header: table.header, rows: table.rows }],
      { deflate: (data) => new Uint8Array(deflateRawSync(data)) },
    )
    c.header('Content-Type', XLSX_MIME)
    return c.body(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    )
  })

  return routes
}

/** Project activity log for admins and QA leads (doc 02 section 8). */
export function auditRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('audit.read'), async (c) => {
    const project = c.get('project')
    const f = parseWith(auditFilterSchema, queryOf(c.req.query()))
    const { page, pageSize, offset } = pageParams(c)
    const where = [
      'a.project_id = ?',
      '(? IS NULL OR a.entity_type = ?)',
      '(? IS NULL OR a.action_code = ?)',
      '(? IS NULL OR a.actor_id = ?)',
      '(? IS NULL OR a.created_at >= ?)',
      '(? IS NULL OR a.created_at < ?)',
    ].join(' AND ')
    const start = f.from ? wibDayStart(f.from) : null
    const end = f.to ? wibDayEnd(f.to) : null
    const params = [
      project.id,
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
    const rows = await select<{
      id: string
      created_at: Date
      actor_id: string | null
      display_name: string | null
      entity_type: string
      entity_id: string
      action_code: string
      old_values_json: unknown
      new_values_json: unknown
      request_id: string | null
    }>(
      pool,
      `SELECT a.id, a.created_at, a.actor_id, u.display_name, a.entity_type, a.entity_id,
              a.action_code, a.old_values_json, a.new_values_json, a.request_id
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    )
    const body: Paginated<AuditLogEntry> = {
      data: rows.map((row) => ({
        id: String(row.id),
        created_at: iso(row.created_at) as string,
        actor: row.actor_id
          ? { id: String(row.actor_id), display_name: row.display_name ?? '' }
          : null,
        entity_type: row.entity_type,
        entity_id: String(row.entity_id),
        action_code: row.action_code,
        changes: auditChanges(parseJson(row.old_values_json), parseJson(row.new_values_json)),
        request_id: row.request_id,
      })),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  return routes
}
