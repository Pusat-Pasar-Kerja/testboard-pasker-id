import {
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  emptyStatusCounts,
  executedOf,
  isOpenDefect,
  passRate,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_TIMEZONE,
  totalOf,
  wibDayEnd,
  wibDayStart,
  type AttemptRecord,
  type CaseRecord,
  type CaseSnapshot,
  type DefectPriority,
  type DefectRecord,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionKind,
  type ExecutionStatus,
  type ReportDataset,
  type ReportDefectSummary,
  type ReportFilter,
  type ReportGroupRow,
  type ReportOverview,
  type ReportRecordMap,
  type ReportRunRow,
  type ReportTesterRow,
  type ResultRecord,
  type RunStatus,
  type StatusCounts,
} from '@testboard/shared'
import { iso, parseJson, select, type Db } from '../db/tx.js'
import { AppError } from '../lib/errors.js'

/**
 * Report queries (doc 04 S09). Every statement is scoped by project_id and uses bound
 * parameters only. Scope rules are documented in packages/shared/src/report.ts.
 */

interface Scope {
  sql: string
  params: unknown[]
}

const from = (f: ReportFilter) => (f.from ? wibDayStart(f.from) : null)
const until = (f: ReportFilter) => (f.to ? wibDayEnd(f.to) : null)

/** Runs (alias r) of the project matching run/cycle and, optionally, the period overlap. */
function runScope(projectId: string, f: ReportFilter, period: boolean): Scope {
  const parts = ['r.project_id = ?', '(? IS NULL OR r.id = ?)', '(? IS NULL OR r.cycle_id = ?)']
  const params: unknown[] = [
    projectId,
    f.run_id ?? null,
    f.run_id ?? null,
    f.cycle_id ?? null,
    f.cycle_id ?? null,
  ]
  if (period) {
    parts.push('(? IS NULL OR COALESCE(r.ends_at, r.starts_at, r.created_at) >= ?)')
    parts.push('(? IS NULL OR COALESCE(r.starts_at, r.created_at) < ?)')
    params.push(from(f), from(f), until(f), until(f))
  }
  return { sql: parts.join(' AND '), params }
}

/** Test cases (alias tc) of the chosen module. */
function moduleScope(f: ReportFilter, alias = 'tc'): Scope {
  return {
    sql: `(? IS NULL OR ${alias}.module_id = ?)`,
    params: [f.module_id ?? null, f.module_id ?? null],
  }
}

/** Attempts (alias te) tested within the period (unsaved times fall back to created_at). */
function testedScope(f: ReportFilter): Scope {
  return {
    sql:
      '(? IS NULL OR COALESCE(te.tested_at, te.created_at) >= ?) AND ' +
      '(? IS NULL OR COALESCE(te.tested_at, te.created_at) < ?)',
    params: [from(f), from(f), until(f), until(f)],
  }
}

/** Bugs (alias d) of the project, module, reporting period and - with a run/cycle filter - linked runs. */
function defectScope(projectId: string, f: ReportFilter): Scope {
  const parts = [
    'd.project_id = ?',
    '(? IS NULL OR d.module_id = ?)',
    '(? IS NULL OR d.created_at >= ?)',
    '(? IS NULL OR d.created_at < ?)',
  ]
  const params: unknown[] = [
    projectId,
    f.module_id ?? null,
    f.module_id ?? null,
    from(f),
    from(f),
    until(f),
    until(f),
  ]
  if (f.run_id || f.cycle_id) {
    const runs = runScope(projectId, f, false)
    parts.push(
      `EXISTS (SELECT 1 FROM defect_execution_links l
                 JOIN test_executions te ON te.id = l.execution_id
                 JOIN test_run_cases trc ON trc.id = te.run_case_id
                 JOIN test_runs r ON r.id = trc.test_run_id
                WHERE l.defect_id = d.id AND ${runs.sql})`,
    )
    params.push(...runs.params)
  }
  return { sql: parts.join(' AND '), params }
}

const and = (...scopes: Scope[]): Scope => ({
  sql: scopes.map((s) => s.sql).join(' AND '),
  params: scopes.flatMap((s) => s.params),
})

function group(
  key: string,
  code: string | null,
  name: string,
  counts: StatusCounts,
): ReportGroupRow {
  return { key, code, name, run_cases: totalOf(counts), counts, pass_rate: passRate(counts) }
}

export async function reportOverview(
  db: Db,
  project: { id: string; code: string },
  f: ReportFilter,
): Promise<ReportOverview> {
  const scope = and(runScope(project.id, f, true), moduleScope(f))

  const runs = await select<{
    id: string
    run_code: string
    name: string
    status_code: RunStatus
    starts_at: Date | null
    ends_at: Date | null
    cycle_code: string | null
  }>(
    db,
    `SELECT r.id, r.run_code, r.name, r.status_code, r.starts_at, r.ends_at, c.cycle_code
       FROM test_runs r LEFT JOIN test_cycles c ON c.id = r.cycle_id
      WHERE ${runScope(project.id, f, true).sql}
      ORDER BY COALESCE(r.starts_at, r.created_at) DESC, r.id DESC`,
    runScope(project.id, f, true).params,
  )

  const tallies = await select<{
    run_id: string
    module_id: string | null
    latest_status: ExecutionStatus
    n: number
  }>(
    db,
    `SELECT v.test_run_id AS run_id, tc.module_id, v.latest_status, COUNT(*) AS n
       FROM v_run_case_latest_status v
       JOIN test_runs r ON r.id = v.test_run_id
       JOIN test_cases tc ON tc.id = v.test_case_id
      WHERE ${scope.sql}
      GROUP BY v.test_run_id, tc.module_id, v.latest_status`,
    scope.params,
  )

  const modules = await select<{ id: string; module_code: string; name: string }>(
    db,
    'SELECT id, module_code, name FROM modules WHERE project_id = ? ORDER BY module_code',
    [project.id],
  )

  const totals = emptyStatusCounts()
  const byRun = new Map<string, StatusCounts>()
  const byModule = new Map<string, StatusCounts>()
  for (const t of tallies) {
    const n = Number(t.n)
    totals[t.latest_status] += n
    const runCounts = byRun.get(String(t.run_id)) ?? emptyStatusCounts()
    runCounts[t.latest_status] += n
    byRun.set(String(t.run_id), runCounts)
    const moduleKey = t.module_id === null ? 'none' : String(t.module_id)
    const moduleCounts = byModule.get(moduleKey) ?? emptyStatusCounts()
    moduleCounts[t.latest_status] += n
    byModule.set(moduleKey, moduleCounts)
  }

  const runRows: ReportRunRow[] = runs
    .map((run) => {
      const counts = byRun.get(String(run.id)) ?? emptyStatusCounts()
      return {
        ...group(String(run.id), run.run_code, run.name, counts),
        id: String(run.id),
        status_code: run.status_code,
        cycle_code: run.cycle_code,
        starts_at: iso(run.starts_at),
        ends_at: iso(run.ends_at),
      }
    })
    // With a module filter, runs without cases of that module are noise.
    .filter((run) => !f.module_id || run.run_cases > 0)

  const moduleRows: ReportGroupRow[] = modules
    .filter((m) => byModule.has(String(m.id)))
    .map((m) =>
      group(String(m.id), m.module_code, m.name, byModule.get(String(m.id)) as StatusCounts),
    )
  const noModule = byModule.get('none')
  if (noModule) moduleRows.push(group('none', null, '', noModule))

  const attempts = and(runScope(project.id, f, false), moduleScope(f), testedScope(f))
  const testerTallies = await select<{
    tester_id: string | null
    name: string | null
    legacy_tester_name: string | null
    result_status: ExecutionStatus
    n: number
    retests: number
    last_tested_at: Date | null
  }>(
    db,
    `SELECT te.tester_id, MAX(u.display_name) AS name, te.legacy_tester_name, te.result_status,
            COUNT(*) AS n, SUM(te.attempt_number > 1) AS retests, MAX(te.tested_at) AS last_tested_at
       FROM test_executions te
       JOIN test_run_cases trc ON trc.id = te.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
       LEFT JOIN users u ON u.id = te.tester_id
      WHERE ${attempts.sql}
      GROUP BY te.tester_id, te.legacy_tester_name, te.result_status`,
    attempts.params,
  )
  const testers = new Map<string, ReportTesterRow>()
  for (const t of testerTallies) {
    const legacy = t.tester_id === null && Boolean(t.legacy_tester_name)
    const key = t.tester_id
      ? `user:${t.tester_id}`
      : legacy
        ? `legacy:${t.legacy_tester_name}`
        : 'none'
    const row = testers.get(key) ?? {
      key,
      tester_id: t.tester_id ? String(t.tester_id) : null,
      name: t.name ?? t.legacy_tester_name ?? '',
      legacy,
      attempts: 0,
      retests: 0,
      counts: emptyStatusCounts(),
      last_tested_at: null,
    }
    const n = Number(t.n)
    row.attempts += n
    row.retests += Number(t.retests)
    row.counts[t.result_status] += n
    const last = iso(t.last_tested_at)
    if (last && (!row.last_tested_at || last > row.last_tested_at)) row.last_tested_at = last
    testers.set(key, row)
  }
  const testerRows = [...testers.values()].sort(
    (a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name),
  )

  const defects = defectScope(project.id, f)
  const defectTallies = await select<{
    severity_code: DefectSeverity
    status_code: DefectStatus
    n: number
  }>(
    db,
    `SELECT d.severity_code, d.status_code, COUNT(*) AS n FROM defects d
      WHERE ${defects.sql} GROUP BY d.severity_code, d.status_code`,
    defects.params,
  )
  const defectSummary: ReportDefectSummary = {
    total: 0,
    open: 0,
    by_severity: Object.fromEntries(
      DEFECT_SEVERITIES.map((s) => [s, { open: 0, total: 0 }]),
    ) as ReportDefectSummary['by_severity'],
    by_status: Object.fromEntries(DEFECT_STATUSES.map((s) => [s, 0])) as Record<
      DefectStatus,
      number
    >,
  }
  for (const d of defectTallies) {
    const n = Number(d.n)
    defectSummary.total += n
    if (d.status_code in defectSummary.by_status) defectSummary.by_status[d.status_code] += n
    const severity = defectSummary.by_severity[d.severity_code]
    if (severity) severity.total += n
    if (isOpenDefect(d.status_code)) {
      defectSummary.open += n
      if (severity) severity.open += n
    }
  }

  return {
    project_code: project.code,
    generated_at: new Date().toISOString(),
    timezone: REPORT_TIMEZONE,
    filters: f,
    totals: {
      run_cases: totalOf(totals),
      executed: executedOf(totals),
      attempts: testerRows.reduce((sum, t) => sum + t.attempts, 0),
      retests: testerRows.reduce((sum, t) => sum + t.retests, 0),
      counts: totals,
      pass_rate: passRate(totals),
    },
    by_run: runRows,
    by_module: moduleRows,
    by_tester: testerRows,
    defects: defectSummary,
  }
}

// ---------------------------------------------------------------------------- exports

const LIMIT = REPORT_EXPORT_MAX_ROWS + 1

function guardSize(count: number): void {
  if (count > REPORT_EXPORT_MAX_ROWS) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Too many rows; narrow the filters.', [
      { field: 'dataset', message: 'EXPORT_TOO_LARGE' },
    ])
  }
}

function linksBy(rows: { k: string; v: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const key = String(row.k)
    const list = map.get(key) ?? []
    if (!list.includes(row.v)) list.push(row.v)
    map.set(key, list)
  }
  return map
}

const snapshotOf = (value: unknown) => parseJson<Partial<CaseSnapshot>>(value) ?? {}

async function resultRecords(db: Db, projectId: string, f: ReportFilter): Promise<ResultRecord[]> {
  const scope = and(runScope(projectId, f, true), moduleScope(f))
  const rows = await select<{
    run_case_id: string
    run_code: string
    run_name: string
    cycle_code: string | null
    module_code: string | null
    case_code: string
    title: string
    case_snapshot_json: unknown
    case_version: number
    latest_status: ExecutionStatus
    last_attempt_number: number | null
    last_tested_at: Date | null
    actual_result: string | null
    notes: string | null
    last_tester: string | null
    assignee: string | null
  }>(
    db,
    `SELECT trc.id AS run_case_id, r.run_code, r.name AS run_name, c.cycle_code, m.module_code,
            tc.case_code, tc.title, trc.case_snapshot_json, trc.case_version, v.latest_status,
            v.last_attempt_number, v.last_tested_at, te.actual_result, te.notes,
            COALESCE(u.display_name, te.legacy_tester_name) AS last_tester,
            a.display_name AS assignee
       FROM test_run_cases trc
       JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
       JOIN test_runs r ON r.id = trc.test_run_id
       LEFT JOIN test_cycles c ON c.id = r.cycle_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
       LEFT JOIN modules m ON m.id = tc.module_id
       LEFT JOIN test_executions te ON te.id = v.last_execution_id
       LEFT JOIN users u ON u.id = te.tester_id
       LEFT JOIN users a ON a.id = trc.assigned_to
      WHERE ${scope.sql}
      ORDER BY COALESCE(r.starts_at, r.created_at) DESC, r.id DESC, trc.sort_order, trc.id
      LIMIT ${LIMIT}`,
    scope.params,
  )
  guardSize(rows.length)
  const bugs = linksBy(
    await select<{ k: string; v: string }>(
      db,
      `SELECT trc.id AS k, d.bug_code AS v
         FROM defect_execution_links l
         JOIN defects d ON d.id = l.defect_id
         JOIN test_executions te ON te.id = l.execution_id
         JOIN test_run_cases trc ON trc.id = te.run_case_id
         JOIN test_runs r ON r.id = trc.test_run_id
         JOIN test_cases tc ON tc.id = trc.test_case_id
        WHERE ${scope.sql} ORDER BY d.bug_code`,
      scope.params,
    ),
  )
  return rows.map((row) => {
    const snap = snapshotOf(row.case_snapshot_json)
    return {
      run_code: row.run_code,
      run_name: row.run_name,
      cycle_code: row.cycle_code,
      module_code: row.module_code,
      case_code: snap.case_code ?? row.case_code,
      title: snap.title ?? row.title,
      case_version: Number(row.case_version),
      status: row.latest_status,
      attempts: Number(row.last_attempt_number ?? 0),
      last_tested_at: iso(row.last_tested_at),
      last_tester: row.last_tester,
      assignee: row.assignee,
      actual_result: row.actual_result,
      notes: row.notes,
      bugs: bugs.get(String(row.run_case_id)) ?? [],
    }
  })
}

async function attemptRecords(
  db: Db,
  projectId: string,
  f: ReportFilter,
): Promise<AttemptRecord[]> {
  const scope = and(runScope(projectId, f, false), moduleScope(f), testedScope(f))
  const rows = await select<{
    id: string
    run_code: string
    module_code: string | null
    case_code: string
    title: string
    case_snapshot_json: unknown
    attempt_number: number
    execution_kind: ExecutionKind
    result_status: ExecutionStatus
    tested_at: Date | null
    tester: string | null
    actual_result: string | null
    notes: string | null
    browser_name: string | null
    device_name: string | null
    operating_system: string | null
    evidence: number
  }>(
    db,
    `SELECT te.id, r.run_code, m.module_code, tc.case_code, tc.title, trc.case_snapshot_json,
            te.attempt_number, te.execution_kind, te.result_status, te.tested_at,
            COALESCE(u.display_name, te.legacy_tester_name) AS tester, te.actual_result, te.notes,
            te.browser_name, te.device_name, te.operating_system,
            (SELECT COUNT(*) FROM execution_files ef WHERE ef.execution_id = te.id) AS evidence
       FROM test_executions te
       JOIN test_run_cases trc ON trc.id = te.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
       LEFT JOIN modules m ON m.id = tc.module_id
       LEFT JOIN users u ON u.id = te.tester_id
      WHERE ${scope.sql}
      ORDER BY COALESCE(r.starts_at, r.created_at) DESC, r.id DESC, trc.sort_order, trc.id,
               te.attempt_number
      LIMIT ${LIMIT}`,
    scope.params,
  )
  guardSize(rows.length)
  const bugs = linksBy(
    await select<{ k: string; v: string }>(
      db,
      `SELECT te.id AS k, d.bug_code AS v
         FROM defect_execution_links l
         JOIN defects d ON d.id = l.defect_id
         JOIN test_executions te ON te.id = l.execution_id
         JOIN test_run_cases trc ON trc.id = te.run_case_id
         JOIN test_runs r ON r.id = trc.test_run_id
         JOIN test_cases tc ON tc.id = trc.test_case_id
        WHERE ${scope.sql} ORDER BY d.bug_code`,
      scope.params,
    ),
  )
  return rows.map((row) => {
    const snap = snapshotOf(row.case_snapshot_json)
    return {
      run_code: row.run_code,
      module_code: row.module_code,
      case_code: snap.case_code ?? row.case_code,
      title: snap.title ?? row.title,
      attempt_number: Number(row.attempt_number),
      kind: row.execution_kind,
      status: row.result_status,
      tested_at: iso(row.tested_at),
      tester: row.tester,
      actual_result: row.actual_result,
      notes: row.notes,
      browser: row.browser_name,
      device: row.device_name,
      os: row.operating_system,
      evidence: Number(row.evidence),
      bugs: bugs.get(String(row.id)) ?? [],
    }
  })
}

async function defectRecords(db: Db, projectId: string, f: ReportFilter): Promise<DefectRecord[]> {
  const scope = defectScope(projectId, f)
  const rows = await select<{
    id: string
    bug_code: string
    title: string
    severity_code: DefectSeverity
    priority_code: DefectPriority
    status_code: DefectStatus
    module_code: string | null
    reporter: string | null
    assignee: string | null
    environment_name: string | null
    build_version: string | null
    fixed_in_version: string | null
    created_at: Date
    resolved_at: Date | null
    closed_at: Date | null
  }>(
    db,
    `SELECT d.id, d.bug_code, d.title, d.severity_code, d.priority_code, d.status_code,
            m.module_code, rep.display_name AS reporter, asg.display_name AS assignee,
            d.environment_name, d.build_version, d.fixed_in_version, d.created_at,
            d.resolved_at, d.closed_at
       FROM defects d
       LEFT JOIN modules m ON m.id = d.module_id
       LEFT JOIN users rep ON rep.id = d.reported_by
       LEFT JOIN users asg ON asg.id = d.assigned_to
      WHERE ${scope.sql}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT ${LIMIT}`,
    scope.params,
  )
  guardSize(rows.length)
  const links = await select<{ k: string; case_code: string; run_code: string }>(
    db,
    `SELECT d.id AS k, tc.case_code, r.run_code
       FROM defect_execution_links l
       JOIN defects d ON d.id = l.defect_id
       JOIN test_executions te ON te.id = l.execution_id
       JOIN test_run_cases trc ON trc.id = te.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
      WHERE ${scope.sql} ORDER BY tc.case_code`,
    scope.params,
  )
  const cases = linksBy(links.map((l) => ({ k: l.k, v: l.case_code })))
  const runs = linksBy(links.map((l) => ({ k: l.k, v: l.run_code })))
  return rows.map((row) => ({
    bug_code: row.bug_code,
    title: row.title,
    severity: row.severity_code,
    priority: row.priority_code,
    status: row.status_code,
    module_code: row.module_code,
    reporter: row.reporter,
    assignee: row.assignee,
    environment: row.environment_name,
    build: row.build_version,
    fixed_in_version: row.fixed_in_version,
    created_at: iso(row.created_at),
    resolved_at: iso(row.resolved_at),
    closed_at: iso(row.closed_at),
    cases: cases.get(String(row.id)) ?? [],
    runs: runs.get(String(row.id)) ?? [],
  }))
}

async function caseRecords(db: Db, projectId: string, f: ReportFilter): Promise<CaseRecord[]> {
  const scope = moduleScope(f)
  const rows = await select<{
    case_code: string
    module_code: string | null
    suite_name: string | null
    reference_document: string | null
    category: string | null
    title: string
    requirement_refs: string | null
    priority_code: string
    test_type_code: string
    actor_label: string | null
    preconditions: string | null
    test_steps_text: string | null
    expected_result: string | null
    source_locale: string
    case_status: string
    current_version: number
    updated_at: Date
  }>(
    db,
    `SELECT tc.case_code, m.module_code, s.name AS suite_name, s.reference_document, tc.category,
            tc.title, tc.requirement_refs, tc.priority_code, tc.test_type_code, tc.actor_label,
            tc.preconditions, tc.test_steps_text, tc.expected_result, tc.source_locale,
            tc.case_status, tc.current_version, tc.updated_at
       FROM test_cases tc
       LEFT JOIN modules m ON m.id = tc.module_id
       LEFT JOIN test_suites s ON s.id = tc.suite_id
      WHERE tc.project_id = ? AND tc.deleted_at IS NULL AND ${scope.sql}
      ORDER BY m.module_code, tc.sequence_number, tc.case_code
      LIMIT ${LIMIT}`,
    [projectId, ...scope.params],
  )
  guardSize(rows.length)
  return rows.map((row) => ({
    case_code: row.case_code,
    module_code: row.module_code,
    suite_name: row.suite_name,
    category: row.category,
    title: row.title,
    requirement_refs: row.requirement_refs,
    priority_code: row.priority_code,
    test_type_code: row.test_type_code,
    actor_label: row.actor_label,
    preconditions: row.preconditions,
    test_steps_text: row.test_steps_text,
    expected_result: row.expected_result,
    source_locale: row.source_locale,
    source_document: row.reference_document,
    case_status: row.case_status,
    current_version: Number(row.current_version),
    updated_at: iso(row.updated_at),
  }))
}

export async function reportRecords<D extends ReportDataset>(
  db: Db,
  projectId: string,
  dataset: D,
  f: ReportFilter,
): Promise<ReportRecordMap[D][]> {
  const loaders: { [K in ReportDataset]: () => Promise<ReportRecordMap[K][]> } = {
    results: () => resultRecords(db, projectId, f),
    attempts: () => attemptRecords(db, projectId, f),
    defects: () => defectRecords(db, projectId, f),
    cases: () => caseRecords(db, projectId, f),
  }
  return (await loaders[dataset]()) as ReportRecordMap[D][]
}
