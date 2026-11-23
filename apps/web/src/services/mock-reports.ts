import {
  auditChanges,
  auditLabel,
  auditRefIds,
  auditRefKey,
  auditSnapshotLabel,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  emptyStatusCounts,
  executedOf,
  isOpenDefect,
  latestStatus,
  passRate,
  REPORT_TIMEZONE,
  totalOf,
  wibDayEnd,
  wibDayStart,
  type AttemptRecord,
  type AuditChange,
  type AuditLogEntry,
  type AuditRefKind,
  type CaseRecord,
  type DefectRecord,
  type ReportDataset,
  type ReportDefectSummary,
  type ReportFilter,
  type ReportGroupRow,
  type ReportOverview,
  type ReportRecordMap,
  type ReportRunRow,
  type ReportTesterRow,
  type ResultRecord,
  type StatusCounts,
} from '@testboard/shared'
import type { MockDb, MockExecution, MockRun } from '../mocks/seed'

/**
 * Reports for the demo data source: the same scope rules as the API
 * (apps/api/src/reports/queries.ts, packages/shared/src/report.ts).
 */

/** Demo-session audit entries (e.g. exports); real audit lives in the API database. */
export interface MockAuditEntry {
  id: string
  projectId: string
  actorId: string | null
  entity_type: string
  entity_id: string
  action_code: string
  oldValues?: unknown
  newValues?: unknown
  at: string
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NaN)

function inPeriod(f: ReportFilter, start: number, end: number): boolean {
  if (f.from && end < wibDayStart(f.from).getTime()) return false
  if (f.to && start >= wibDayEnd(f.to).getTime()) return false
  return true
}

function scope(db: MockDb, projectId: string, f: ReportFilter, period: boolean) {
  const runs = db.runs.filter((r) => {
    if (r.projectId !== projectId) return false
    if (f.run_id && r.id !== f.run_id) return false
    if (f.cycle_id && r.cycleId !== f.cycle_id) return false
    if (!period) return true
    const fallback = Date.now()
    const start = time(r.starts_at) || time(r.ends_at) || fallback
    const end = time(r.ends_at) || time(r.starts_at) || fallback
    return inPeriod(f, start, end)
  })
  const runIds = new Set(runs.map((r) => r.id))
  const runCases = db.runCases.filter((rc) => {
    if (!runIds.has(rc.runId)) return false
    const testCase = db.cases.find((c) => c.id === rc.caseId)
    return !f.module_id || testCase?.moduleId === f.module_id
  })
  return { runs, runCases }
}

const attemptsOf = (db: MockDb, runCaseId: string) =>
  db.executions.filter((e) => e.runCaseId === runCaseId)

const userName = (db: MockDb, id: string | null | undefined) =>
  db.users.find((u) => u.id === id)?.display_name ?? null

const testerName = (db: MockDb, e: MockExecution | undefined) =>
  e ? (e.legacyTester ?? userName(db, e.testerId)) : null

function group(
  key: string,
  code: string | null,
  name: string,
  counts: StatusCounts,
): ReportGroupRow {
  return { key, code, name, run_cases: totalOf(counts), counts, pass_rate: passRate(counts) }
}

function defectsInScope(db: MockDb, projectId: string, f: ReportFilter) {
  const linked =
    f.run_id || f.cycle_id ? scope(db, projectId, { ...f, module_id: undefined }, false) : null
  const linkedExecutions = linked
    ? new Set(
        db.executions
          .filter((e) => linked.runCases.some((rc) => rc.id === e.runCaseId))
          .map((e) => e.id),
      )
    : null
  return db.defects.filter((d) => {
    if (d.projectId !== projectId) return false
    if (f.module_id && d.moduleId !== f.module_id) return false
    const created = time(d.created_at)
    if (!inPeriod(f, created, created)) return false
    return !linkedExecutions || d.executionIds.some((id) => linkedExecutions.has(id))
  })
}

export function mockReportOverview(
  db: MockDb,
  project: { id: string; project_code: string },
  f: ReportFilter,
): ReportOverview {
  const { runs, runCases } = scope(db, project.id, f, true)
  const totals = emptyStatusCounts()
  const byRun = new Map<string, StatusCounts>()
  const byModule = new Map<string, StatusCounts>()
  for (const rc of runCases) {
    const status = latestStatus(attemptsOf(db, rc.id))
    totals[status] += 1
    const runCounts = byRun.get(rc.runId) ?? emptyStatusCounts()
    runCounts[status] += 1
    byRun.set(rc.runId, runCounts)
    const moduleId = db.cases.find((c) => c.id === rc.caseId)?.moduleId || 'none'
    const moduleCounts = byModule.get(moduleId) ?? emptyStatusCounts()
    moduleCounts[status] += 1
    byModule.set(moduleId, moduleCounts)
  }

  const sortKey = (r: MockRun) => r.starts_at ?? r.ends_at ?? ''
  const runRows: ReportRunRow[] = [...runs]
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .map((run) => ({
      ...group(run.id, run.run_code, run.name, byRun.get(run.id) ?? emptyStatusCounts()),
      id: run.id,
      status_code: run.status_code,
      cycle_code: db.cycles.find((c) => c.id === run.cycleId)?.cycle_code ?? null,
      starts_at: run.starts_at,
      ends_at: run.ends_at,
    }))
    .filter((run) => !f.module_id || run.run_cases > 0)

  const moduleRows = db.modules
    .filter((m) => m.projectId === project.id && byModule.has(m.id))
    .sort((a, b) => a.module_code.localeCompare(b.module_code))
    .map((m) => group(m.id, m.module_code, m.name, byModule.get(m.id) as StatusCounts))
  const none = byModule.get('none')
  if (none) moduleRows.push(group('none', null, '', none))

  const attemptScope = scope(db, project.id, f, false)
  const scopedRunCases = new Set(attemptScope.runCases.map((rc) => rc.id))
  const testers = new Map<string, ReportTesterRow>()
  for (const e of db.executions) {
    if (!scopedRunCases.has(e.runCaseId)) continue
    const tested = time(e.tested_at)
    if (!inPeriod(f, tested, tested)) continue
    const legacy = Boolean(e.legacyTester)
    const key = legacy ? `legacy:${e.legacyTester}` : `user:${e.testerId}`
    const row = testers.get(key) ?? {
      key,
      tester_id: legacy ? null : e.testerId,
      name: testerName(db, e) ?? '',
      legacy,
      attempts: 0,
      retests: 0,
      counts: emptyStatusCounts(),
      last_tested_at: null,
    }
    row.attempts += 1
    if (e.attempt_number > 1) row.retests += 1
    row.counts[e.result_status] += 1
    if (!row.last_tested_at || e.tested_at > row.last_tested_at) row.last_tested_at = e.tested_at
    testers.set(key, row)
  }
  const testerRows = [...testers.values()].sort(
    (a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name),
  )

  const defects: ReportDefectSummary = {
    total: 0,
    open: 0,
    by_severity: Object.fromEntries(
      DEFECT_SEVERITIES.map((s) => [s, { open: 0, total: 0 }]),
    ) as ReportDefectSummary['by_severity'],
    by_status: Object.fromEntries(
      DEFECT_STATUSES.map((s) => [s, 0]),
    ) as ReportDefectSummary['by_status'],
  }
  for (const d of defectsInScope(db, project.id, f)) {
    defects.total += 1
    defects.by_status[d.status_code] += 1
    defects.by_severity[d.severity_code].total += 1
    if (isOpenDefect(d.status_code)) {
      defects.open += 1
      defects.by_severity[d.severity_code].open += 1
    }
  }

  return {
    project_code: project.project_code,
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
    defects,
  }
}

const bugCodesFor = (db: MockDb, executionIds: Set<string>) =>
  db.defects
    .filter((d) => d.executionIds.some((id) => executionIds.has(id)))
    .map((d) => d.bug_code)
    .sort()

export function mockReportRecords<D extends ReportDataset>(
  db: MockDb,
  projectId: string,
  dataset: D,
  f: ReportFilter,
): ReportRecordMap[D][] {
  const moduleCode = (id: string | null | undefined) =>
    db.modules.find((m) => m.id === id)?.module_code ?? null
  const runOf = (id: string) => db.runs.find((r) => r.id === id) as MockRun

  if (dataset === 'results') {
    const { runCases } = scope(db, projectId, f, true)
    const records: ResultRecord[] = runCases.map((rc) => {
      const testCase = db.cases.find((c) => c.id === rc.caseId)
      const attempts = attemptsOf(db, rc.id)
      const last = [...attempts].sort((a, b) => b.attempt_number - a.attempt_number)[0]
      const run = runOf(rc.runId)
      return {
        run_code: run.run_code,
        run_name: run.name,
        cycle_code: db.cycles.find((c) => c.id === run.cycleId)?.cycle_code ?? null,
        module_code: moduleCode(testCase?.moduleId),
        case_code: rc.snapshot?.case_code ?? testCase?.case_code ?? '',
        title: rc.snapshot?.title ?? testCase?.title ?? '',
        case_version: rc.case_version,
        status: latestStatus(attempts),
        attempts: last?.attempt_number ?? 0,
        last_tested_at: last?.tested_at ?? null,
        last_tester: testerName(db, last),
        assignee: userName(db, rc.assignedTo),
        actual_result: last?.actual_result ?? null,
        notes: last?.notes ?? null,
        bugs: bugCodesFor(db, new Set(attempts.map((a) => a.id))),
      }
    })
    return records as ReportRecordMap[D][]
  }

  if (dataset === 'attempts') {
    const { runCases } = scope(db, projectId, f, false)
    const records: AttemptRecord[] = runCases.flatMap((rc) => {
      const testCase = db.cases.find((c) => c.id === rc.caseId)
      return attemptsOf(db, rc.id)
        .filter((e) => inPeriod(f, time(e.tested_at), time(e.tested_at)))
        .sort((a, b) => a.attempt_number - b.attempt_number)
        .map((e) => ({
          run_code: runOf(rc.runId).run_code,
          module_code: moduleCode(testCase?.moduleId),
          case_code: rc.snapshot?.case_code ?? testCase?.case_code ?? '',
          title: rc.snapshot?.title ?? testCase?.title ?? '',
          attempt_number: e.attempt_number,
          kind: e.execution_kind,
          status: e.result_status,
          tested_at: e.tested_at,
          tester: testerName(db, e),
          actual_result: e.actual_result,
          notes: e.notes ?? null,
          browser: e.browser_name ?? null,
          device: e.device_name ?? null,
          os: e.operating_system ?? null,
          evidence: e.files?.length ?? 0,
          bugs: bugCodesFor(db, new Set([e.id])),
        }))
    })
    return records as ReportRecordMap[D][]
  }

  if (dataset === 'defects') {
    const records: DefectRecord[] = defectsInScope(db, projectId, f)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((d) => {
        const runCaseIds = new Set(
          db.executions.filter((e) => d.executionIds.includes(e.id)).map((e) => e.runCaseId),
        )
        const linked = db.runCases.filter((rc) => runCaseIds.has(rc.id))
        const closedAt = d.history.filter((h) => h.to === 'CLOSED').at(-1)?.at ?? null
        const resolvedAt =
          d.history.filter((h) => h.to === 'FIXED' || h.to === 'WONT_FIX').at(-1)?.at ?? null
        return {
          bug_code: d.bug_code,
          title: d.title,
          severity: d.severity_code,
          priority: d.priority_code,
          status: d.status_code,
          module_code: moduleCode(d.moduleId),
          reporter: userName(db, d.reportedBy),
          assignee: userName(db, d.assignedTo),
          environment: d.environment_name || null,
          build: d.build_version || null,
          fixed_in_version: d.fixed_in_version,
          created_at: d.created_at,
          resolved_at: resolvedAt,
          closed_at: closedAt,
          cases: [
            ...new Set(
              linked.map((rc) => db.cases.find((c) => c.id === rc.caseId)?.case_code ?? ''),
            ),
          ].sort(),
          runs: [...new Set(linked.map((rc) => runOf(rc.runId).run_code))].sort(),
        }
      })
    return records as ReportRecordMap[D][]
  }

  const records: CaseRecord[] = db.cases
    .filter((c) => c.projectId === projectId && (!f.module_id || c.moduleId === f.module_id))
    .sort(
      (a, b) =>
        (moduleCode(a.moduleId) ?? '').localeCompare(moduleCode(b.moduleId) ?? '') ||
        a.case_code.localeCompare(b.case_code),
    )
    .map((c) => ({
      case_code: c.case_code,
      module_code: moduleCode(c.moduleId),
      suite_name: c.suiteName || null,
      category: c.category || null,
      title: c.title,
      requirement_refs: c.requirement_refs,
      priority_code: c.priority_code,
      test_type_code: c.test_type_code,
      actor_label: c.actor_label || null,
      preconditions: c.preconditions || null,
      test_steps_text: c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') || null,
      expected_result: c.expected_result || null,
      source_locale: 'id',
      source_document: null,
      case_status: c.case_status,
      current_version: c.current_version,
      updated_at: c.updated_at,
    }))
  return records as ReportRecordMap[D][]
}

/** Demo activity log: derived from the demo data plus actions taken in this session. */
/** Same naming as the API (apps/api/src/lib/audit-entries.ts), from the demo data. */
function mockEntityLabel(db: MockDb, type: string, id: string): string | null {
  const user = () => db.users.find((u) => u.id === id)?.display_name ?? null
  switch (type) {
    case 'defect': {
      const d = db.defects.find((x) => x.id === id)
      return d ? auditLabel(d.bug_code, d.title) : null
    }
    case 'test_case': {
      const c = db.cases.find((x) => x.id === id)
      return c ? auditLabel(c.case_code, c.title) : null
    }
    case 'test_run': {
      const r = db.runs.find((x) => x.id === id)
      return r ? auditLabel(r.run_code, r.name) : null
    }
    case 'test_execution': {
      const e = db.executions.find((x) => x.id === id)
      const rc = e && db.runCases.find((x) => x.id === e.runCaseId)
      const run = rc && db.runs.find((x) => x.id === rc.runId)
      const c = rc && db.cases.find((x) => x.id === rc.caseId)
      return c ? auditLabel(c.case_code, run?.run_code) : null
    }
    case 'test_cycle': {
      const c = db.cycles.find((x) => x.id === id)
      return c ? auditLabel(c.cycle_code, c.title) : null
    }
    case 'module': {
      const m = db.modules.find((x) => x.id === id)
      return m ? auditLabel(m.module_code, m.name) : null
    }
    case 'file':
      return db.files.find((x) => x.id === id)?.original_filename ?? null
    case 'project': {
      const p = db.projects.find((x) => x.id === id)
      return p ? auditLabel(p.project_code, p.name) : null
    }
    case 'user':
    case 'project_member':
      return user()
    default:
      return null
  }
}

const MOCK_REF_TYPE: Record<AuditRefKind, string> = {
  user: 'user',
  cycle: 'test_cycle',
  module: 'module',
  suite: '',
  run: 'test_run',
  defect: 'defect',
  case: 'test_case',
}

function mockRefs(db: MockDb, changes: AuditChange[]): Record<string, string> {
  const refs: Record<string, string> = {}
  for (const [kind, ids] of auditRefIds(changes)) {
    for (const id of ids) {
      const name = mockEntityLabel(db, MOCK_REF_TYPE[kind], id)
      if (name) refs[auditRefKey(kind, id)] = name
    }
  }
  return refs
}

export function mockAuditLog(db: MockDb, projectId: string, session: MockAuditEntry[]) {
  const entries: (Omit<AuditLogEntry, 'actor' | 'changes' | 'entity_label' | 'refs'> & {
    actorId: string | null
    oldValues?: unknown
    newValues?: unknown
  })[] = []
  for (const d of db.defects.filter((x) => x.projectId === projectId)) {
    d.history.forEach((h, i) => {
      entries.push({
        id: `defect-${d.id}-${i}`,
        created_at: h.at,
        actorId: h.by,
        entity_type: 'defect',
        entity_id: d.id,
        action_code: h.from === null ? 'CREATE' : 'STATUS_CHANGE',
        oldValues: h.from === null ? undefined : { status_code: h.from },
        newValues:
          h.from === null
            ? { bug_code: d.bug_code, title: d.title, severity_code: d.severity_code }
            : { status_code: h.to, ...(h.comment ? { reason: h.comment } : {}) },
        request_id: null,
      })
    })
  }
  const runCaseIds = new Set(
    db.runCases
      .filter((rc) => db.runs.some((r) => r.id === rc.runId && r.projectId === projectId))
      .map((rc) => rc.id),
  )
  for (const e of db.executions.filter((x) => runCaseIds.has(x.runCaseId))) {
    entries.push({
      id: `execution-${e.id}`,
      created_at: e.tested_at,
      actorId: e.legacyTester ? null : e.testerId,
      entity_type: 'test_execution',
      entity_id: e.id,
      action_code: 'CREATE',
      newValues: { attempt_number: e.attempt_number, result_status: e.result_status },
      request_id: null,
    })
  }
  for (const s of session.filter((x) => x.projectId === projectId)) {
    entries.push({
      id: s.id,
      created_at: s.at,
      actorId: s.actorId,
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      action_code: s.action_code,
      oldValues: s.oldValues,
      newValues: s.newValues,
      request_id: null,
    })
  }
  return entries
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .map(({ actorId, oldValues, newValues, ...entry }) => {
      const changes = auditChanges(oldValues, newValues)
      return {
        ...entry,
        actor: actorId ? { id: actorId, display_name: userName(db, actorId) ?? '' } : null,
        entity_label:
          mockEntityLabel(db, entry.entity_type, entry.entity_id) ??
          auditSnapshotLabel(oldValues, newValues),
        changes,
        refs: mockRefs(db, changes),
      }
    })
}
