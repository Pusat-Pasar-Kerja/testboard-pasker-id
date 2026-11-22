import {
  adminProjectUpdateSchema,
  caseBulkSchema,
  DEFECT_REASON_REQUIRED,
  defectImportConfigSchema,
  importedDescription,
  planDefectRows,
  type DefectImportConfig,
  type DefectImportPreview,
  type DefectImportResult,
  type ImportTarget,
  type PreparedDefectRow,
  findSimilarPairs,
  testCaseMergeSchema,
  defectBulkSchema,
  type BulkResult,
  defaultSiteSettings,
  projectCreateSchema,
  PUBLIC_SITE_SETTING_KEYS,
  siteSettingsUpdateSchema,
  type AdminProjectDto,
  type AuditLogEntry,
  type PublicSiteSettings,
  type SiteSettingKey,
  type SiteSettingsDto,
  type SessionDeviceDto,
  auditFilterSchema,
  buildXlsx,
  CSV_MIME,
  REPORT_SHEET_NAMES,
  reportExportSchema,
  reportFileName,
  reportFilterSchema,
  reportTable,
  toCsv,
  wibDayEnd,
  wibDayStart,
  XLSX_MIME,
  aiImportSchema,
  CASE_IMPORT_FIELDS,
  finishPlan,
  importConfigSchema,
  mergeForMode,
  moduleCodeFromName,
  parseCsv,
  planRows,
  RECORDABLE_RESULTS,
  type CheckedCase,
  type ExistingCase,
  type ImportConfig,
  type ImportJobDto,
  type ImportJobStatus,
  type ImportPreview,
  type ImportResultSummary,
  type ImportRowDto,
  type ImportSheetInfo,
  type ImportSourceFormat,
  type ImportSourceKind,
  type PlanSheet,
  type PreparedRow,
  type RecordableResult,
  EVIDENCE_RULES,
  evidenceTypeFor,
  extensionOf,
  isFileUsable,
  type AttachedFileDto,
  type EvidenceItem,
  type EvidenceRef,
  type FileDto,
  type FileFailureReason,
  type FileUsage,
  canTransitionDefect,
  DEFECT_FIELDS,
  defectCommentSchema,
  defectCreateSchema,
  defectEditableFields,
  defectStatusSchema,
  defectUpdateSchema,
  roleCan,
  type DefectActor,
  type DefectField,
  type Permission,
  countStatuses,
  emptySeverityCounts,
  isOpenDefect,
  latestStatus,
  PAGINATION,
  stepsFromText,
  canTransitionRun,
  cycleCreateSchema,
  cycleUpdateSchema,
  moduleUpdateSchema,
  executionCreateSchema,
  runCreateSchema,
  runUpdateSchema,
  type CaseSnapshot,
  type CycleDto,
  type ExecutionDto,
  type RunCaseDetail,
  testCaseCreateSchema,
  testCaseUpdateSchema,
  type AdminUserDto,
  type CurrentUser,
  type Locale,
  type MemberDto,
  type MemberRole,
  type SuiteDto,
  type DashboardSummary,
  type DefectDetail,
  type DefectListItem,
  type ModuleDto,
  type Paginated,
  type ProjectSummary,
  type RunCaseRow,
  type TestCaseDetail,
  type TestCaseListItem,
  type TestRunDetail,
  type TestRunSummary,
  type UserRef,
} from '@testboard/shared'
import {
  createMockDb,
  type MockCase,
  type MockDb,
  type MockDefect,
  type MockExecution,
  type MockFile,
  type MockFileLink,
  type MockRun,
  type MockRunCase,
} from '../mocks/seed'
import { ApiClientError } from './api-client'
import {
  mockAuditLog,
  mockReportOverview,
  mockReportRecords,
  type MockAuditEntry,
} from './mock-reports'
import { createMockRecovery } from './mock-recovery'
import type {
  AddRunCasesResult,
  DataSource,
  DefectQuery,
  FileQuery,
  ImportRowQuery,
  PageQuery,
  TestCaseInput,
  TestCaseQuery,
} from './data-source'

function notFound(): never {
  throw new ApiClientError(404, 'NOT_FOUND', 'Not found', 'mock-request')
}

function fail(
  status: number,
  code: 'CONFLICT' | 'VALIDATION_ERROR',
  field: string,
  message: string,
): never {
  throw new ApiClientError(status, code, message, 'mock-request', [{ field, message }])
}

function validationError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new ApiClientError(
    422,
    'VALIDATION_ERROR',
    'The submitted data is invalid.',
    'mock-request',
    issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  )
}

export function paginate<T>(items: T[], query: PageQuery = {}): Paginated<T> {
  const pageSize = Math.min(
    Math.max(1, query.page_size ?? PAGINATION.defaultPageSize),
    PAGINATION.maxPageSize,
  )
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(1, query.page ?? 1), pages)
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: items.length,
  }
}

/** In-memory implementation of the API contract over fictitious data. */
export function createMockDataSource(
  options: { latencyMs?: number; db?: MockDb; superAdmin?: boolean; permanentAdmin?: string } = {},
): DataSource {
  const latencyMs = options.latencyMs ?? 200
  const db = options.db ?? createMockDb()
  /** Demo-session audit entries (exports); the rest of the log is derived from the data. */
  const sessionAudit: MockAuditEntry[] = []
  /** > 0 while a bulk action runs: its inner single-item calls skip the demo latency. */
  let bulkDepth = 0
  const delay = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(
        () => {
          try {
            resolve(value())
          } catch (error) {
            reject(error)
          }
        },
        bulkDepth > 0 ? 0 : latencyMs,
      ),
    )

  const userRef = (userId: string | null): UserRef | null => {
    const user = db.users.find((u) => u.id === userId)
    return user ? { id: user.id, display_name: user.display_name } : null
  }

  // Project scoping: only projects where the current user is a member are visible.
  const project = (code: string) => {
    const found = db.projects.find(
      (p) => p.project_code === code && p.members.some((m) => m.userId === db.currentUserId),
    )
    return found ?? notFound()
  }
  const roleIn = (projectId: string) =>
    db.projects.find((p) => p.id === projectId)?.members.find((m) => m.userId === db.currentUserId)
      ?.role ?? 'VIEWER'

  const moduleDto = (moduleId: string | null): ModuleDto | null => {
    const m = db.modules.find((x) => x.id === moduleId)
    return m ? { id: m.id, module_code: m.module_code, name: m.name } : null
  }

  const attemptsOf = (runCaseId: string) => db.executions.filter((e) => e.runCaseId === runCaseId)

  const runCaseRows = (run: MockRun): RunCaseRow[] =>
    db.runCases
      .filter((rc) => rc.runId === run.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((rc) => {
        const testCase = db.cases.find((c) => c.id === rc.caseId) as MockCase
        const attempts = attemptsOf(rc.id)
        const last = [...attempts].sort((a, b) => b.attempt_number - a.attempt_number)[0]
        const executionIds = new Set(attempts.map((e) => e.id))
        return {
          run_case_id: rc.id,
          test_case_id: testCase.id,
          case_code: testCase.case_code,
          title: rc.snapshot?.title ?? testCase.title,
          module_code: moduleDto(testCase.moduleId)?.module_code ?? null,
          case_version: rc.case_version,
          assigned_to: userRef(rc.assignedTo),
          latest_status: latestStatus(attempts),
          attempts: attempts.length,
          last_tested_at: last?.tested_at ?? null,
          defect_codes: db.defects
            .filter((d) => d.executionIds.some((eid) => executionIds.has(eid)))
            .map((d) => d.bug_code),
        }
      })

  const runSummary = (run: MockRun): TestRunSummary => {
    const rows = runCaseRows(run)
    const cycle = db.cycles.find((c) => c.id === run.cycleId)
    return {
      id: run.id,
      run_code: run.run_code,
      name: run.name,
      cycle: cycle ? { id: cycle.id, cycle_code: cycle.cycle_code, title: cycle.title } : null,
      environment_name: run.environment_name,
      build_version: run.build_version,
      status_code: run.status_code,
      starts_at: run.starts_at,
      ends_at: run.ends_at,
      total_cases: rows.length,
      counts: countStatuses(rows.map((r) => r.latest_status)),
    }
  }

  const caseListItem = (c: MockCase): TestCaseListItem => ({
    id: c.id,
    case_code: c.case_code,
    title: c.title,
    module: moduleDto(c.moduleId),
    category: c.category,
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    case_status: c.case_status,
    current_version: c.current_version,
    updated_at: c.updated_at,
    updated_by: userRef(c.updatedBy),
  })

  const defectListItem = (d: MockDefect): DefectListItem => ({
    id: d.id,
    bug_code: d.bug_code,
    title: d.title,
    status_code: d.status_code,
    severity_code: d.severity_code,
    priority_code: d.priority_code,
    module: moduleDto(d.moduleId),
    cycle: (() => {
      const cy = db.cycles.find((x) => x.id === d.cycleId)
      return cy ? { id: cy.id, cycle_code: cy.cycle_code, title: cy.title } : null
    })(),
    reported_by: userRef(d.reportedBy),
    assigned_to: userRef(d.assignedTo),
    created_at: d.created_at,
    updated_at: d.updated_at,
  })

  const projectDefects = (projectId: string) =>
    db.defects
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const projectSummary = (p: MockDb['projects'][number]): ProjectSummary => ({
    id: p.id,
    project_code: p.project_code,
    name: p.name,
    description: p.description,
    role_code: roleIn(p.id),
    is_archived: Boolean(p.archived),
    counts: {
      test_cases: db.cases.filter((c) => c.projectId === p.id && c.case_status !== 'ARCHIVED')
        .length,
      runs: db.runs.filter((r) => r.projectId === p.id).length,
      open_defects: db.defects.filter((d) => d.projectId === p.id && isOpenDefect(d.status_code))
        .length,
    },
  })

  // ---- Demo-only mutable state (in memory; resets on reload) ----------------------
  const profile: { locale: Locale } = { locale: 'id' }
  // The demo user is shown as Super Admin so every screen of the prototype can be explored.
  const superAdmins = new Set<string>(options.superAdmin === false ? [] : [db.currentUserId])
  /** Permanent (owner) Super Admin; on the server only a CLI command can set it. */
  const permanentAdmins = new Set<string>(options.permanentAdmin ? [options.permanentAdmin] : [])
  const inactive = new Set<string>()
  let siteSettings = defaultSiteSettings()
  const settingsChanged: SiteSettingsDto['changed'] = {}
  let sequence = 900_000
  const newId = () => String(++sequence)
  const now = () => new Date().toISOString()
  const recovery = createMockRecovery({
    delay,
    users: () => db.users,
    currentUserId: () => db.currentUserId,
    requireSuperAdmin: () => requireSuperAdmin(),
    isPermanent: (userId) => permanentAdmins.has(userId),
    isActive: (userId) => !inactive.has(userId),
    linkHours: () => siteSettings['recovery.link_hours'],
    audit: (entityType, entityId, action, newValues) =>
      siteAudit('', entityType, entityId, action, undefined, newValues),
    newId,
  })

  interface MockSuite {
    id: string
    projectId: string
    moduleId: string | null
    name: string
    reference_document: string | null
    reference_version: string | null
    created_at: string
  }
  const suites: MockSuite[] = []
  for (const c of db.cases) {
    if (!suites.some((s) => s.projectId === c.projectId && s.name === c.suiteName)) {
      suites.push({
        id: newId(),
        projectId: c.projectId,
        moduleId: c.moduleId,
        name: c.suiteName,
        reference_document: null,
        reference_version: null,
        created_at: c.created_at,
      })
    }
  }
  const suiteNameOf = (projectId: string, suiteId: string | null | undefined): string | null => {
    if (!suiteId) return null
    const suite = suites.find((s) => s.id === suiteId && s.projectId === projectId)
    return suite ? suite.name : fail(422, 'VALIDATION_ERROR', 'suite_id', 'Suite not found')
  }
  const suiteDto = (s: MockSuite): SuiteDto => ({
    id: s.id,
    name: s.name,
    module: moduleDto(s.moduleId),
    description: null,
    reference_document: s.reference_document,
    reference_url: null,
    reference_version: s.reference_version,
    owner_unit: null,
    scope_description: null,
    preparation_date: null,
    source_notes: null,
    case_count: db.cases.filter(
      (c) => c.projectId === s.projectId && c.suiteName === s.name && c.case_status !== 'ARCHIVED',
    ).length,
    created_at: s.created_at,
  })

  const currentUser = (): CurrentUser => {
    const user = db.users.find((u) => u.id === db.currentUserId) ?? notFound()
    return {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      preferred_locale: profile.locale,
      is_super_admin: superAdmins.has(user.id),
      projects: db.projects
        .filter((p) => p.members.some((m) => m.userId === user.id))
        .map((p) => ({ project_code: p.project_code, role_code: roleIn(p.id) })),
    }
  }

  const memberDto = (userId: string, role: MemberRole): MemberDto => {
    const user = db.users.find((u) => u.id === userId) ?? notFound()
    return {
      user: {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        is_active: !inactive.has(user.id),
      },
      role_code: role,
      joined_at: '2026-10-01T02:00:00.000Z',
    }
  }

  const adminUser = (userId: string): AdminUserDto => {
    const user = db.users.find((u) => u.id === userId) ?? notFound()
    return {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      preferred_locale: 'id',
      is_active: !inactive.has(user.id),
      is_super_admin: superAdmins.has(user.id),
      is_permanent: permanentAdmins.has(user.id),
      created_at: '2026-10-01T02:00:00.000Z',
      reset_link: recovery.activeLinkOf(user.id),
    }
  }

  const caseIn = (projectId: string, caseId: string) =>
    db.cases.find((c) => c.id === caseId && c.projectId === projectId) ?? notFound()

  const nextCode = (projectId: string, moduleCode: string | null) => {
    const prefix = `UAT-${moduleCode ?? 'CASE'}-`
    const max = db.cases
      .filter((c) => c.projectId === projectId && c.case_code.startsWith(prefix))
      .reduce((m, c) => Math.max(m, Number.parseInt(c.case_code.slice(prefix.length), 10) || 0), 0)
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  const moduleIdByCode = (projectId: string, code: string | null | undefined) => {
    if (code === undefined) return undefined
    if (code === null) return null
    const found = db.modules.find((m) => m.projectId === projectId && m.module_code === code)
    return found ? found.id : fail(422, 'VALIDATION_ERROR', 'module_code', 'Module not found')
  }

  const addRevision = (c: MockCase, reason: string) => {
    c.revisions.push({
      revision_number: c.current_version,
      changedBy: db.currentUserId,
      change_reason: reason,
      changed_at: now(),
    })
  }

  const assertKeepsAdmin = (members: { role: MemberRole }[], member: { role: MemberRole }) => {
    if (member.role === 'ADMIN' && members.filter((m) => m.role === 'ADMIN').length === 1) {
      fail(409, 'CONFLICT', 'role_code', 'A project must keep at least one ADMIN.')
    }
  }

  // ---- Milestone 6: import (demo: CSV/JSON in memory, same planner as the API) ------
  interface MockImportJob {
    id: string
    projectId: string
    filename: string
    format: ImportSourceFormat
    kind: ImportSourceKind
    status: ImportJobStatus
    sheets: PlanSheet[]
    defaults: { suite_name?: string; source_locale?: 'id' | 'en' }
    config: ImportConfig | null
    rows: (PreparedRow & { id: string; final?: 'IMPORTED' | 'SKIPPED' | 'ERROR' })[]
    preview: ImportPreview | null
    result: ImportResultSummary | null
    target: ImportTarget
    defectConfig: DefectImportConfig | null
    defectRows: (PreparedDefectRow & { id: string; final?: 'IMPORTED' | 'SKIPPED' })[]
    defectPreview: DefectImportPreview | null
    defectResult: DefectImportResult | null
    createdBy: string
    created_at: string
    completed_at: string | null
  }
  const importJobs: MockImportJob[] = []
  const readText = async (file: Blob): Promise<string> => {
    if (typeof file.text === 'function') return file.text()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsText(file)
    })
  }
  const importJobIn = (projectId: string, jobId: string) =>
    importJobs.find((j) => j.id === jobId && j.projectId === projectId) ?? notFound()
  const sheetInfoOf = (sheet: PlanSheet): ImportSheetInfo => ({
    name: sheet.name,
    hidden: false,
    row_count: sheet.rows.length,
    column_count: Math.max(0, ...sheet.rows.map((r) => r.length)),
    image_count: 0,
    suggested_header_row: 1,
    header_cells: sheet.rows[0] ?? [],
    sample_rows: sheet.rows.slice(1, 4),
    top_rows: sheet.rows.slice(0, 30),
    reference_document: null,
    reference_version: null,
    suggested_module_code: moduleCodeFromName(sheet.name),
  })
  const importDto = (job: MockImportJob): ImportJobDto => {
    const counts = job.preview?.counts
    if (job.target === 'DEFECTS') {
      const d = job.defectPreview?.counts
      return {
        id: job.id,
        original_filename: job.filename,
        source_format: job.format,
        source_kind: job.kind,
        import_target: 'DEFECTS',
        import_mode: 'CREATE_ONLY',
        status_code: job.status,
        total_rows: d?.total ?? 0,
        valid_rows: d?.create ?? 0,
        imported_rows: job.defectResult?.created_defects ?? 0,
        skipped_rows: job.defectResult?.skipped_rows ?? (d ? d.skipped + d.duplicate : 0),
        invalid_rows: d?.invalid ?? 0,
        created_by: userRef(job.createdBy),
        created_at: job.created_at,
        completed_at: job.completed_at,
        sheets: job.sheets.map(sheetInfoOf),
        config: null,
        preview: null,
        result: null,
        defect_config: job.defectConfig,
        defect_preview: job.defectPreview,
        defect_result: job.defectResult,
        failure: null,
      }
    }
    return {
      id: job.id,
      original_filename: job.filename,
      source_format: job.format,
      source_kind: job.kind,
      import_target: 'TEST_CASES',
      import_mode: job.config?.import_mode ?? 'CREATE_ONLY',
      status_code: job.status,
      total_rows: counts?.total ?? 0,
      valid_rows: counts ? counts.valid + counts.review : 0,
      imported_rows: job.result
        ? job.result.created_cases + job.result.updated_cases + job.result.executions
        : 0,
      skipped_rows: job.result?.skipped_rows ?? counts?.duplicate ?? 0,
      invalid_rows: counts?.invalid ?? 0,
      created_by: userRef(job.createdBy),
      created_at: job.created_at,
      completed_at: job.completed_at,
      sheets: job.sheets.map(sheetInfoOf),
      config: job.config,
      preview: job.preview,
      result: job.result,
      defect_config: null,
      defect_preview: null,
      defect_result: null,
      failure: null,
    }
  }
  /** Demo bug import: same plan as the API, then bugs are created in memory. */
  const applyDefectImport = (job: MockImportJob) => {
    const p = db.projects.find((x) => x.id === job.projectId)!
    const config = job.defectConfig!
    const result: DefectImportResult = {
      created_defects: 0,
      skipped_rows: 0,
      linked_results: 0,
      images_imported: 0,
      images_failed: 0,
      images_left_out: 0,
    }
    const cycle = db.cycles.find((cy) => cy.id === config.cycle_id && cy.projectId === p.id)
    for (const row of job.defectRows) {
      if (row.status !== 'VALID') {
        result.skipped_rows++
        row.final = 'SKIPPED'
        continue
      }
      const v = row.values
      let moduleId: string | null = null
      if (v.module_code) {
        let mod = db.modules.find((m) => m.projectId === p.id && m.module_code === v.module_code)
        if (!mod) {
          mod = { id: newId(), projectId: p.id, module_code: v.module_code, name: row.sheet }
          db.modules.push(mod)
        }
        moduleId = mod.id
      }
      const at = now()
      const code =
        v.bug_code && !db.defects.some((d) => d.projectId === p.id && d.bug_code === v.bug_code)
          ? v.bug_code
          : nextBugCode(p)
      const executionIds: string[] = []
      if (config.link_results && v.case_code) {
        const c = db.cases.find((x) => x.projectId === p.id && x.case_code === v.case_code)
        const attempts = db.executions.filter((e) => {
          const rc = db.runCases.find((x) => x.id === e.runCaseId)
          const run = db.runs.find((r) => r.id === rc?.runId)
          return rc?.caseId === c?.id && run && (!cycle || run.cycleId === cycle.id)
        })
        const best =
          attempts.find((e) => e.result_status === 'FAILED') ?? attempts[attempts.length - 1]
        if (best) {
          executionIds.push(best.id)
          result.linked_results++
        }
      }
      db.defects.push({
        id: newId(),
        projectId: p.id,
        moduleId,
        cycleId: cycle?.id ?? null,
        legacyReporterName: v.reporter_name,
        reportedAt: v.reported_at ? `${v.reported_at.slice(0, 10)}T00:00:00.000Z` : null,
        sourceReference: [job.filename, row.sheet, `baris ${row.row}`, v.case_code]
          .filter(Boolean)
          .join(' / '),
        bug_code: code,
        title: v.title,
        description: importedDescription(v) ?? '',
        steps_to_reproduce: '',
        expected_behavior: '',
        actual_behavior: '',
        severity_code: v.severity,
        priority_code: v.priority,
        status_code: v.status,
        source_kind: v.source_kind,
        environment_name: '',
        build_version: '',
        browser_name: '',
        fixed_in_version: null,
        reportedBy: '',
        assignedTo: null,
        created_at: at,
        updated_at: at,
        executionIds,
        history: [
          {
            from: null,
            to: v.status,
            by: job.createdBy,
            comment: `Diimpor dari ${job.filename}`,
            at,
          },
        ],
        comments: v.notes
          ? [
              {
                id: newId(),
                authorId: job.createdBy,
                body: `Catatan dari file: ${v.notes}`,
                created_at: at,
              },
            ]
          : [],
      })
      row.final = 'IMPORTED'
      result.created_defects++
    }
    job.defectResult = result
    job.status = 'COMPLETED'
    job.completed_at = now()
  }
  const checkedOf = (c: MockCase): CheckedCase => ({
    case_code: c.case_code,
    module_code: moduleDto(c.moduleId)?.module_code ?? null,
    suite_name: c.suiteName || null,
    sequence_number: null,
    category: c.category || null,
    title: c.title,
    requirement_refs: c.requirement_refs,
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    actor_label: c.actor_label || null,
    preconditions: c.preconditions || null,
    test_steps_text: c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') || null,
    expected_result: c.expected_result,
    source_locale: 'id',
    source_document: null,
  })
  /** Apply a previewed demo import: cases, modules/suites and (optionally) a results run. */
  const applyImport = (job: MockImportJob) => {
    const config = job.config as ImportConfig
    const summary: ImportResultSummary = {
      created_cases: 0,
      updated_cases: 0,
      unchanged_cases: 0,
      skipped_rows: 0,
      run: null,
      executions: 0,
      images_imported: 0,
      images_failed: 0,
      images_left_out: 0,
    }
    const caseFor = new Map<string, MockCase>()
    // Rows that need a new code go last (ADR 0013).
    for (const row of [
      ...job.rows.filter((r) => !r.renumber),
      ...job.rows.filter((r) => r.renumber),
    ]) {
      if (row.status === 'DUPLICATE') {
        row.final = 'SKIPPED'
        summary.skipped_rows++
        continue
      }
      if (row.status !== 'VALID') continue
      const v = row.values
      let mod = db.modules.find(
        (m) => m.projectId === job.projectId && m.module_code === v.module_code,
      )
      if (!mod) {
        mod = {
          id: newId(),
          projectId: job.projectId,
          module_code: v.module_code as string,
          name: v.module_code as string,
        }
        db.modules.push(mod)
      }
      if (
        v.suite_name &&
        !suites.some((s) => s.projectId === job.projectId && s.name === v.suite_name)
      ) {
        suites.push({
          id: newId(),
          projectId: job.projectId,
          moduleId: mod.id,
          name: v.suite_name,
          reference_document: null,
          reference_version: null,
          created_at: now(),
        })
      }
      const steps = stepsFromText(v.test_steps_text).map((s) => s.instruction)
      let target: MockCase | undefined
      if (row.action === 'CREATE') {
        target = {
          id: newId(),
          projectId: job.projectId,
          moduleId: mod.id,
          suiteName: v.suite_name ?? '',
          case_code:
            v.case_code && !row.renumber ? v.case_code : nextCode(job.projectId, v.module_code),
          category: v.category ?? '',
          title: v.title,
          requirement_refs: v.requirement_refs,
          priority_code: v.priority_code,
          test_type_code: v.test_type_code,
          actor_label: v.actor_label ?? '',
          preconditions: v.preconditions ?? '',
          steps,
          expected_result: v.expected_result,
          case_status: config.include_results ? 'READY' : config.case_status,
          current_version: 1,
          createdBy: db.currentUserId,
          updatedBy: db.currentUserId,
          created_at: now(),
          updated_at: now(),
          revisions: [],
        }
        addRevision(target, `Imported: ${job.filename} (${row.sheet}!${row.row})`)
        db.cases.push(target)
        summary.created_cases++
        row.final = 'IMPORTED'
      } else {
        target = db.cases.find((c) => c.id === row.target_id)
        if (!target) continue
        if (row.action === 'UPDATE') {
          const merged = mergeForMode(checkedOf(target), v, config.import_mode)
          Object.assign(target, {
            moduleId: mod.id,
            suiteName: merged.suite_name ?? '',
            category: merged.category ?? '',
            title: merged.title,
            requirement_refs: merged.requirement_refs,
            priority_code: merged.priority_code,
            test_type_code: merged.test_type_code,
            actor_label: merged.actor_label ?? '',
            preconditions: merged.preconditions ?? '',
            steps: stepsFromText(merged.test_steps_text).map((s) => s.instruction),
            expected_result: merged.expected_result,
            current_version: target.current_version + 1,
            updated_at: now(),
          })
          addRevision(target, `Import update: ${job.filename}`)
          summary.updated_cases++
          row.final = 'IMPORTED'
        } else {
          summary.unchanged_cases++
          row.final = config.include_results ? 'IMPORTED' : 'SKIPPED'
          if (!config.include_results) summary.skipped_rows++
        }
        if (config.include_results && target.case_status === 'DRAFT') target.case_status = 'READY'
      }
      row.target_id = target.id
      caseFor.set(row.id, target)
    }

    if (config.include_results && config.run && caseFor.size > 0) {
      const stamp = now()
      const prefix = `RUN-${stamp.slice(0, 10).replace(/-/g, '')}-`
      const dates = job.rows
        .filter((row) => caseFor.has(row.id) && row.result.tested_at)
        .map((row) => `${(row.result.tested_at as string).slice(0, 10)}T00:00:00.000Z`)
        .sort()
      const run: MockRun = {
        id: newId(),
        projectId: job.projectId,
        cycleId: config.run.cycle_id ?? '',
        run_code: `${prefix}${db.runs.filter((r) => r.run_code.startsWith(prefix)).length + 1}`,
        name: config.run.name,
        environment_name: config.run.environment_name ?? '',
        build_version: config.run.build_version ?? '',
        environment_url: '',
        status_code: 'COMPLETED',
        starts_at: dates[0] ?? stamp,
        ends_at: dates.at(-1) ?? stamp,
      }
      db.runs.push(run)
      summary.run = { id: run.id, run_code: run.run_code }
      let order = 0
      const inRun = new Set<string>()
      for (const row of job.rows) {
        const target = caseFor.get(row.id)
        if (!target || inRun.has(target.id)) continue
        inRun.add(target.id)
        const rc: MockRunCase = {
          id: newId(),
          runId: run.id,
          caseId: target.id,
          assignedTo: null,
          case_version: target.current_version,
          sort_order: ++order,
          snapshot: snapshotOfCase(target),
        }
        db.runCases.push(rc)
        const status = row.result.status
        if (status && (RECORDABLE_RESULTS as readonly string[]).includes(status)) {
          db.executions.push({
            id: newId(),
            runCaseId: rc.id,
            attempt_number: 1,
            execution_kind: 'INITIAL',
            result_status: status as RecordableResult,
            actual_result: row.result.actual_result,
            notes: row.result.notes,
            testerId: '',
            legacyTester: row.result.tester_name,
            tested_at: row.result.tested_at
              ? `${row.result.tested_at.slice(0, 10)}T00:00:00.000Z`
              : stamp,
          })
          summary.executions++
        }
      }
    }
    job.result = summary
    job.status = (job.preview?.counts.invalid ?? 0) > 0 ? 'PARTIAL' : 'COMPLETED'
    job.completed_at = now()
  }

  // ---- Milestone 5: evidence (demo: simulated pipeline in memory, ADR 0008) ------------
  const SIGNATURES: Record<string, number[]> = {
    png: [0x89, 0x50, 0x4e, 0x47],
    jpg: [0xff, 0xd8, 0xff],
    jpeg: [0xff, 0xd8, 0xff],
    webp: [0x52, 0x49, 0x46, 0x46],
    pdf: [0x25, 0x50, 0x44, 0x46],
    docx: [0x50, 0x4b, 0x03, 0x04],
    xlsx: [0x50, 0x4b, 0x03, 0x04],
  }
  const readHead = async (file: Blob): Promise<Uint8Array> => {
    const part = file.slice(0, 16)
    if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer())
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
      reader.onerror = () => resolve(new Uint8Array())
      reader.readAsArrayBuffer(part)
    })
  }
  const objectUrl = (file: Blob) =>
    typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
  const fileDto = (f: MockFile): FileDto => ({
    id: f.id,
    evidence_type: f.evidence_type,
    original_filename: f.original_filename,
    original_mime: f.original_mime,
    stored_mime: f.stored_mime,
    original_size_bytes: f.original_size_bytes,
    stored_size_bytes: f.stored_size_bytes,
    compression_method: f.compression_method,
    compression_note: f.compression_note,
    processing_status: f.processing_status,
    scan_status: f.scan_status,
    scan_engine: f.scan_engine,
    failure_reason: f.failure_reason,
    width_px: null,
    height_px: null,
    has_thumbnail: f.evidence_type === 'SCREENSHOT' && f.processing_status === 'READY',
    uploaded_by: userRef(f.uploadedBy),
    uploaded_at: f.uploaded_at,
    processed_at: f.processed_at,
  })
  const attachedDtos = (links: MockFileLink[] | undefined): AttachedFileDto[] =>
    (links ?? []).flatMap((link) => {
      const f = db.files.find((x) => x.id === link.fileId && !x.deleted)
      return f ? [{ ...fileDto(f), caption: link.caption, step_number: link.step_number }] : []
    })
  const fileIn = (projectId: string, fileId: string) =>
    db.files.find((f) => f.id === fileId && f.projectId === projectId && !f.deleted) ?? notFound()
  const assertMockAttachable = (projectId: string, refs: EvidenceRef[]) => {
    for (const ref of refs) {
      const f = db.files.find(
        (x) => x.id === ref.file_id && x.projectId === projectId && !x.deleted,
      )
      if (!f) fail(422, 'VALIDATION_ERROR', 'files', 'File not found in this project')
      else if (!isFileUsable(f)) fail(422, 'VALIDATION_ERROR', 'files', 'File is not ready')
    }
  }
  const addLinks = (target: { files?: MockFileLink[] }, refs: EvidenceRef[]) => {
    target.files ??= []
    for (const ref of refs) {
      if (target.files.some((l) => l.fileId === ref.file_id)) continue
      target.files.push({
        fileId: ref.file_id,
        caption: ref.caption?.trim() || null,
        step_number: ref.step_number ?? null,
      })
    }
  }
  const removeLink = (target: { files?: MockFileLink[] }, fileId: string) => {
    const index = (target.files ?? []).findIndex((l) => l.fileId === fileId)
    if (index < 0) notFound()
    target.files?.splice(index, 1)
  }
  const usagesOfFile = (fileId: string): FileUsage[] => {
    const usages: FileUsage[] = []
    for (const e of db.executions) {
      if (!e.files?.some((l) => l.fileId === fileId)) continue
      const rc = db.runCases.find((x) => x.id === e.runCaseId)
      const run = db.runs.find((r) => r.id === rc?.runId)
      const c = db.cases.find((x) => x.id === rc?.caseId)
      if (rc && run && c) {
        usages.push({
          kind: 'EXECUTION',
          label: `${run.run_code} / ${c.case_code} #${e.attempt_number}`,
          path: `runs/${run.id}/cases/${rc.id}`,
        })
      }
    }
    for (const d of db.defects) {
      if (d.files?.some((l) => l.fileId === fileId)) {
        usages.push({ kind: 'DEFECT', label: d.bug_code, path: `bugs/${d.id}` })
      }
    }
    for (const c of db.cases) {
      if (c.files?.some((l) => l.fileId === fileId)) {
        usages.push({ kind: 'TEST_CASE', label: c.case_code, path: `test-cases/${c.id}` })
      }
    }
    return usages
  }
  /** What the real pipeline would typically record for each type (simulation only). */
  const finishProcessing = (f: MockFile, ext: string) => {
    const size = f.original_size_bytes
    let stored = size
    let method = 'NONE'
    const notes: string[] = []
    if (ext === 'png') {
      stored = Math.max(1, Math.round(size * 0.42))
      method = 'WEBP_LOSSLESS'
      f.stored_mime = 'image/webp'
    } else if (ext === 'jpg' || ext === 'jpeg') {
      stored = Math.max(1, size - Math.min(4096, Math.round(size * 0.03)))
      method = 'METADATA_STRIP'
      notes.push('NO_SIZE_GAIN')
    } else if (ext === 'webp') {
      notes.push('NO_SIZE_GAIN')
    } else if (f.evidence_type === 'DOCUMENT') {
      notes.push('ALREADY_COMPRESSED')
    } else {
      stored = Math.max(1, Math.round(size * 0.22))
      method = 'GZIP'
      if (ext === 'har') notes.push('HAR_REDACTED')
    }
    Object.assign(f, {
      stored_size_bytes: stored,
      compression_method: method,
      compression_note: notes.join(',') || null,
      processing_status: 'READY',
      scan_status: 'CLEAN',
      scan_engine: 'BASIC',
      processed_at: now(),
    })
  }
  const isLeadIn = (projectId: string) => {
    const role = effectiveRole(projectId)
    return role === 'ADMIN' || role === 'QA_LEAD'
  }

  // ---- Milestone 4: bug workflow (demo, same rules as the API, ADR 0007) ------------
  const effectiveRole = (projectId: string): MemberRole =>
    superAdmins.has(db.currentUserId) ? 'ADMIN' : roleIn(projectId)
  const forbidden = (message: string, fields: string[] = []): never => {
    throw new ApiClientError(
      403,
      'FORBIDDEN',
      message,
      'mock-request',
      fields.map((field) => ({ field, message: 'Not allowed for your role' })),
    )
  }
  const requireSuperAdmin = () => {
    if (!superAdmins.has(db.currentUserId)) forbidden('Super Admin only.')
  }
  const siteAudit = (
    projectId: string,
    entityType: string,
    entityId: string,
    action: string,
    oldValues?: unknown,
    newValues?: unknown,
  ) => {
    sessionAudit.push({
      id: `site-${sessionAudit.length + 1}`,
      projectId,
      actorId: db.currentUserId,
      entity_type: entityType,
      entity_id: entityId,
      action_code: action,
      oldValues,
      newValues,
      at: now(),
    })
  }
  const adminProject = (p: MockDb['projects'][number]): AdminProjectDto => ({
    id: p.id,
    project_code: p.project_code,
    name: p.name,
    description: p.description || null,
    is_archived: Boolean(p.archived),
    created_at: p.createdAt ?? '2026-10-01T02:00:00.000Z',
    created_by: userRef(p.createdBy ?? null),
    member_count: p.members.length,
    counts: projectSummary(p).counts,
  })
  const requireRole = (projectId: string, permission: Permission) => {
    if (!roleCan(effectiveRole(projectId), permission)) forbidden('Not allowed.')
  }
  const defectIn = (projectId: string, defectId: string) =>
    db.defects.find((d) => d.id === defectId && d.projectId === projectId) ?? notFound()
  const defectActor = (projectId: string, d: MockDefect): DefectActor => ({
    role: effectiveRole(projectId),
    isAssignee: d.assignedTo === db.currentUserId,
    isReporter: d.reportedBy === db.currentUserId,
  })
  const assertDefectAssignee = (projectId: string, userId: string | null | undefined) => {
    if (!userId) return
    const member = db.projects
      .find((p) => p.id === projectId)
      ?.members.find((m) => m.userId === userId)
    if (!member || member.role === 'VIEWER' || inactive.has(userId)) {
      fail(422, 'VALIDATION_ERROR', 'assigned_to', 'Assignee must be an active project member')
    }
  }
  const assertDefectModule = (projectId: string, moduleId: string | null | undefined) => {
    if (moduleId && !db.modules.some((m) => m.id === moduleId && m.projectId === projectId)) {
      fail(422, 'VALIDATION_ERROR', 'module_id', 'Module not found in this project')
    }
  }
  const assertDefectCycle = (projectId: string, cycleId: string | null | undefined) => {
    if (cycleId && !db.cycles.some((cy) => cy.id === cycleId && cy.projectId === projectId)) {
      fail(422, 'VALIDATION_ERROR', 'cycle_id', 'Cycle not found in this project')
    }
  }
  const executionInProject = (projectId: string, executionId: string) => {
    const exec = db.executions.find((e) => e.id === executionId)
    const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
    return db.runs.some((r) => r.id === rc?.runId && r.projectId === projectId)
  }
  const nextBugCode = (p: MockDb['projects'][number]) => {
    const codes = db.defects.filter((d) => d.projectId === p.id).map((d) => d.bug_code)
    const segment =
      p.project_code
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)
        .at(-1) ?? 'PRJ'
    const prefix =
      p.bugPrefix || codes.at(-1)?.match(/^(.+)-\d+$/)?.[1] || `BUG-${segment.slice(0, 3)}`
    const max = codes.reduce((m, c) => {
      const tail = c.startsWith(`${prefix}-`) ? c.slice(prefix.length + 1) : ''
      return /^\d+$/.test(tail) ? Math.max(m, Number.parseInt(tail, 10)) : m
    }, 0)
    return `${prefix}-${String(max + 1).padStart(4, '0')}`
  }
  /** API field name -> mock property; text fields are stored as '' when empty. */
  const DEFECT_PROP: Record<DefectField, keyof MockDefect> = {
    title: 'title',
    description: 'description',
    steps_to_reproduce: 'steps_to_reproduce',
    expected_behavior: 'expected_behavior',
    actual_behavior: 'actual_behavior',
    module_id: 'moduleId',
    cycle_id: 'cycleId',
    severity_code: 'severity_code',
    priority_code: 'priority_code',
    environment_name: 'environment_name',
    build_version: 'build_version',
    browser_name: 'browser_name',
    assigned_to: 'assignedTo',
    fixed_in_version: 'fixed_in_version',
  }
  const NULLABLE_PROPS = new Set<keyof MockDefect>([
    'moduleId',
    'cycleId',
    'assignedTo',
    'fixed_in_version',
  ])
  const defectDetail = (d: MockDefect): DefectDetail => ({
    ...defectListItem(d),
    description: d.description || null,
    steps_to_reproduce: d.steps_to_reproduce || null,
    expected_behavior: d.expected_behavior || null,
    actual_behavior: d.actual_behavior || null,
    source_kind: d.source_kind,
    environment_name: d.environment_name || null,
    build_version: d.build_version || null,
    browser_name: d.browser_name || null,
    fixed_in_version: d.fixed_in_version,
    legacy_reporter_name: d.legacyReporterName ?? null,
    reported_at: d.reportedAt ?? null,
    source_reference: d.sourceReference ?? null,
    linked_executions: d.executionIds.flatMap((eid) => {
      const exec = db.executions.find((e) => e.id === eid)
      const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
      const run = db.runs.find((r) => r.id === rc?.runId)
      const c = db.cases.find((x) => x.id === rc?.caseId)
      if (!exec || !rc || !run || !c) return []
      return [
        {
          execution_id: exec.id,
          run_id: run.id,
          run_code: run.run_code,
          run_case_id: rc.id,
          case_code: c.case_code,
          attempt_number: exec.attempt_number,
          result_status: exec.result_status,
          tested_at: exec.tested_at,
        },
      ]
    }),
    history: d.history.map((h) => ({
      from_status: h.from,
      to_status: h.to,
      changed_by: userRef(h.by),
      change_comment: h.comment,
      changed_at: h.at,
    })),
    comments: d.comments.map((c) => ({
      id: c.id,
      author: userRef(c.authorId),
      body: c.body,
      created_at: c.created_at,
    })),
    files: attachedDtos(d.files),
  })
  const defectReplays = new Map<string, DefectDetail>()

  // ---- Milestone 3: cycles, runs and executions (demo, in memory) -------------------
  const conflict = (message: string): never => {
    throw new ApiClientError(409, 'CONFLICT', message, 'mock-request')
  }
  const snapshotOfCase = (c: MockCase): CaseSnapshot => ({
    case_code: c.case_code,
    title: c.title,
    version: c.current_version,
    module_code: moduleDto(c.moduleId)?.module_code ?? null,
    category: c.category || null,
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    actor_label: c.actor_label || null,
    preconditions: c.preconditions || null,
    test_steps_text: c.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') || null,
    steps: c.steps.map((instruction, i) => ({
      step_number: i + 1,
      instruction,
      expected_result: null,
    })),
    expected_result: c.expected_result,
  })
  const runIn = (projectId: string, runId: string) =>
    db.runs.find((r) => r.id === runId && r.projectId === projectId) ?? notFound()
  const cycleDto = (cy: MockDb['cycles'][number]): CycleDto => ({
    id: cy.id,
    cycle_code: cy.cycle_code,
    title: cy.title,
    description: cy.description ?? null,
    status_code: cy.status_code ?? 'ACTIVE',
    starts_on: cy.starts_on ?? null,
    ends_on: cy.ends_on ?? null,
    run_count: db.runs.filter((r) => r.cycleId === cy.id).length,
  })
  const executionDto = (e: MockDb['executions'][number]): ExecutionDto => ({
    id: e.id,
    attempt_number: e.attempt_number,
    execution_kind: e.execution_kind,
    result_status: e.result_status,
    actual_result: e.actual_result,
    notes: e.notes ?? null,
    tester: userRef(e.testerId),
    legacy_tester_name: e.legacyTester ?? null,
    tested_at: e.tested_at,
    browser_name: e.browser_name ?? null,
    device_name: e.device_name ?? null,
    operating_system: e.operating_system ?? null,
    step_results: e.step_results ?? [],
    files: attachedDtos(e.files),
  })
  const assertRunEditable = (run: MockRun, allowCompleted = false) => {
    if (run.status_code === 'LOCKED' || (run.status_code === 'COMPLETED' && !allowCompleted)) {
      conflict(`The run is ${run.status_code.toLowerCase()} and cannot be changed.`)
    }
  }
  const assertAssignee = (projectId: string, userId: string | null | undefined) => {
    if (!userId) return
    const member = db.projects
      .find((p) => p.id === projectId)
      ?.members.find((m) => m.userId === userId)
    if (!member || !['ADMIN', 'QA_LEAD', 'TESTER'].includes(member.role) || inactive.has(userId)) {
      fail(
        422,
        'VALIDATION_ERROR',
        'assigned_to',
        'Assignee must be an active ADMIN, QA_LEAD or TESTER member',
      )
    }
  }
  const replays = new Map<string, ExecutionDto>()

  const api: DataSource = {
    kind: 'mock',

    getHealth: () =>
      delay(() => ({
        status: 'ok' as const,
        service: 'testboard-api' as const,
        version: 'demo',
        time: new Date().toISOString(),
        database: 'not_configured' as const,
      })),

    getCurrentUser: () => delay(currentUser),
    login: () => delay(currentUser),
    listMySessions: () =>
      delay((): SessionDeviceDto[] => [
        {
          key: 'demo-device',
          current: true,
          remembered: false,
          user_agent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
          created_at: now(),
          last_seen_at: now(),
          expires_at: new Date(Date.now() + 12 * 3_600_000).toISOString(),
        },
      ]),
    revokeOtherSessions: () => delay(() => undefined),
    logout: () => delay(() => undefined),
    updateProfile: (input) =>
      delay(() => {
        const user = db.users.find((u) => u.id === db.currentUserId) ?? notFound()
        if (input.display_name) user.display_name = input.display_name
        if (input.preferred_locale) profile.locale = input.preferred_locale
        return currentUser()
      }),
    changePassword: () => delay(() => undefined),

    listMembers: (code) =>
      delay(() =>
        project(code)
          .members.map((m) => memberDto(m.userId, m.role))
          .sort((a, b) => a.user.display_name.localeCompare(b.user.display_name)),
      ),
    addMember: (code, input) =>
      delay(() => {
        const p = project(code)
        const user = db.users.find((u) => u.email === input.email.trim().toLowerCase())
        if (!user) return fail(422, 'VALIDATION_ERROR', 'email', 'No account with this e-mail')
        if (p.members.some((m) => m.userId === user.id)) {
          fail(409, 'CONFLICT', 'email', 'Already a member')
        }
        p.members.push({ userId: user.id, role: input.role_code })
        return memberDto(user.id, input.role_code)
      }),
    updateMember: (code, userId, role) =>
      delay(() => {
        const p = project(code)
        const member = p.members.find((m) => m.userId === userId) ?? notFound()
        if (role !== 'ADMIN') assertKeepsAdmin(p.members, member)
        member.role = role
        return memberDto(userId, role)
      }),
    removeMember: (code, userId) =>
      delay(() => {
        const p = project(code)
        const member = p.members.find((m) => m.userId === userId) ?? notFound()
        assertKeepsAdmin(p.members, member)
        p.members.splice(p.members.indexOf(member), 1)
      }),
    createModule: (code, input) =>
      delay(() => {
        const p = project(code)
        const moduleCode = input.module_code.trim().toUpperCase()
        if (db.modules.some((m) => m.projectId === p.id && m.module_code === moduleCode)) {
          fail(409, 'CONFLICT', 'module_code', 'Already used')
        }
        const created = {
          id: newId(),
          projectId: p.id,
          module_code: moduleCode,
          name: input.name.trim(),
        }
        db.modules.push(created)
        return {
          id: created.id,
          module_code: created.module_code,
          name: created.name,
          description: input.description ?? null,
        }
      }),
    updateModule: (code, moduleId, input) =>
      delay(() => {
        const p = project(code)
        const target =
          db.modules.find((x) => x.id === moduleId && x.projectId === p.id) ?? notFound()
        const parsed = moduleUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const nextCode = parsed.data.module_code?.toUpperCase()
        if (
          nextCode &&
          db.modules.some(
            (x) => x.projectId === p.id && x.id !== target.id && x.module_code === nextCode,
          )
        ) {
          fail(409, 'CONFLICT', 'module_code', 'Already used')
        }
        if (nextCode) target.module_code = nextCode
        if (parsed.data.name !== undefined) target.name = parsed.data.name
        return { id: target.id, module_code: target.module_code, name: target.name }
      }),
    listSuites: (code) =>
      delay(() => {
        const p = project(code)
        return suites
          .filter((s) => s.projectId === p.id)
          .map(suiteDto)
          .sort((a, b) => a.name.localeCompare(b.name))
      }),
    createSuite: (code, input) =>
      delay(() => {
        const p = project(code)
        const suite: MockSuite = {
          id: newId(),
          projectId: p.id,
          moduleId: input.module_id ?? null,
          name: input.name.trim(),
          reference_document: input.reference_document ?? null,
          reference_version: input.reference_version ?? null,
          created_at: now(),
        }
        suites.push(suite)
        return suiteDto(suite)
      }),

    createTestCase: (code, input: TestCaseInput) =>
      delay(() => {
        const p = project(code)
        const parsed = testCaseCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const moduleId = moduleIdByCode(p.id, data.module_code) ?? null
        const caseCode = data.case_code ?? nextCode(p.id, data.module_code ?? null)
        if (db.cases.some((c) => c.projectId === p.id && c.case_code === caseCode)) {
          fail(409, 'CONFLICT', 'case_code', 'Already used')
        }
        const created: MockCase = {
          id: newId(),
          projectId: p.id,
          moduleId: moduleId ?? '',
          suiteName: suiteNameOf(p.id, data.suite_id) ?? '',
          case_code: caseCode,
          category: data.category ?? '',
          title: data.title,
          requirement_refs: data.requirement_refs ?? null,
          priority_code: data.priority_code,
          test_type_code: data.test_type_code,
          actor_label: data.actor_label ?? '',
          preconditions: data.preconditions ?? '',
          steps: stepsFromText(data.test_steps_text).map((step) => step.instruction),
          expected_result: data.expected_result,
          case_status: data.case_status,
          current_version: 1,
          createdBy: db.currentUserId,
          updatedBy: db.currentUserId,
          created_at: now(),
          updated_at: now(),
          revisions: [],
        }
        addRevision(created, 'Created')
        db.cases.push(created)
        return caseListItem(created)
      }),
    updateTestCase: (code, caseId, input) =>
      delay(() => {
        const p = project(code)
        const c = caseIn(p.id, caseId)
        const parsed = testCaseUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (data.expected_version !== undefined && data.expected_version !== c.current_version) {
          fail(409, 'CONFLICT', 'expected_version', `Current version is ${c.current_version}`)
        }
        const contentKeys = Object.keys(data).filter(
          (k) => !['case_status', 'change_reason', 'expected_version'].includes(k),
        )
        if (c.case_status === 'ARCHIVED' && contentKeys.length > 0) {
          throw new ApiClientError(
            409,
            'CONFLICT',
            'Restore the archived test case before editing it.',
            'mock-request',
          )
        }
        const moduleId = moduleIdByCode(p.id, data.module_code)
        if (moduleId !== undefined) c.moduleId = moduleId ?? ''
        if (data.suite_id !== undefined) c.suiteName = suiteNameOf(p.id, data.suite_id) ?? ''
        if (data.title !== undefined) c.title = data.title
        if (data.category !== undefined) c.category = data.category ?? ''
        if (data.requirement_refs !== undefined) c.requirement_refs = data.requirement_refs
        if (data.priority_code) c.priority_code = data.priority_code
        if (data.test_type_code) c.test_type_code = data.test_type_code
        if (data.actor_label !== undefined) c.actor_label = data.actor_label ?? ''
        if (data.preconditions !== undefined) c.preconditions = data.preconditions ?? ''
        if (data.test_steps_text !== undefined) {
          c.steps = stepsFromText(data.test_steps_text).map((step) => step.instruction)
        }
        if (data.expected_result !== undefined) c.expected_result = data.expected_result
        if (data.case_status) c.case_status = data.case_status
        if (c.case_status !== 'ARCHIVED') c.mergedInto = null
        c.current_version += 1
        c.updated_at = now()
        c.updatedBy = db.currentUserId
        addRevision(c, data.change_reason ?? 'Updated')
        return caseListItem(c)
      }),
    archiveTestCase: (code, caseId) =>
      delay(() => {
        const c = caseIn(project(code).id, caseId)
        if (c.case_status !== 'ARCHIVED') {
          c.case_status = 'ARCHIVED'
          c.current_version += 1
          c.updated_at = now()
          addRevision(c, 'Archived')
        }
        return caseListItem(c)
      }),
    cloneTestCase: (code, caseId) =>
      delay(() => {
        const p = project(code)
        const source = caseIn(p.id, caseId)
        const clone: MockCase = {
          ...source,
          id: newId(),
          case_code: nextCode(p.id, moduleDto(source.moduleId)?.module_code ?? null),
          case_status: 'DRAFT',
          current_version: 1,
          steps: [...source.steps],
          created_at: now(),
          updated_at: now(),
          createdBy: db.currentUserId,
          updatedBy: db.currentUserId,
          revisions: [],
        }
        addRevision(clone, `Cloned from ${source.case_code}`)
        db.cases.push(clone)
        return caseListItem(clone)
      }),

    listUsers: (q) =>
      delay(() => {
        const needle = q?.trim().toLowerCase()
        return db.users
          .filter(
            (u) =>
              !needle || u.email.includes(needle) || u.display_name.toLowerCase().includes(needle),
          )
          .map((u) => adminUser(u.id))
      }),
    createUser: (input) =>
      delay(() => {
        const email = input.email.trim().toLowerCase()
        if (db.users.some((u) => u.email === email)) fail(409, 'CONFLICT', 'email', 'Already used')
        const user = { id: newId(), display_name: input.display_name.trim(), email }
        db.users.push(user)
        if (input.is_super_admin) superAdmins.add(user.id)
        // Demo only: a visibly fake value; the real API returns a random password once.
        return { user: adminUser(user.id), temporary_password: 'Demo-Bukan-Kata-Sandi-Asli' }
      }),
    updateUser: (userId, input) =>
      delay(() => {
        const user = db.users.find((u) => u.id === userId) ?? notFound()
        if (
          permanentAdmins.has(userId) &&
          (input.is_super_admin === false || input.is_active === false)
        ) {
          throw new ApiClientError(
            403,
            'FORBIDDEN',
            'The permanent Super Admin cannot be revoked or deactivated.',
            'mock-request',
            [{ field: 'user', message: 'PERMANENT_SUPER_ADMIN' }],
          )
        }
        const losesSuperAdmin =
          superAdmins.has(userId) && (input.is_super_admin === false || input.is_active === false)
        const activeAdmins = [...superAdmins].filter((id) => !inactive.has(id))
        if (losesSuperAdmin && activeAdmins.length <= 1) {
          throw new ApiClientError(
            409,
            'CONFLICT',
            'At least one active Super Admin must remain.',
            'mock-request',
          )
        }
        if (input.display_name) user.display_name = input.display_name
        if (input.is_active === false) inactive.add(userId)
        if (input.is_active === true) inactive.delete(userId)
        if (input.is_super_admin === true) superAdmins.add(userId)
        if (input.is_super_admin === false) superAdmins.delete(userId)
        return adminUser(userId)
      }),

    listProjects: () =>
      delay(() =>
        db.projects
          .filter((p) => p.members.some((m) => m.userId === db.currentUserId))
          .map(projectSummary),
      ),

    getProject: (code) => delay(() => projectSummary(project(code))),

    listModules: (code) =>
      delay(() => {
        const p = project(code)
        return db.modules
          .filter((m) => m.projectId === p.id)
          .map((m) => ({ id: m.id, module_code: m.module_code, name: m.name }))
      }),

    getDashboard: (code, filter = {}) =>
      delay((): DashboardSummary => {
        const p = project(code)
        const runs = db.runs.filter((r) => r.projectId === p.id)
        const scopedRuns = filter.run_id ? runs.filter((r) => r.id === filter.run_id) : runs
        if (filter.run_id && scopedRuns.length === 0) notFound()
        const rows = scopedRuns.flatMap(runCaseRows)
        const openDefects = db.defects.filter(
          (d) => d.projectId === p.id && isOpenDefect(d.status_code),
        )
        const bySeverity = emptySeverityCounts()
        for (const d of openDefects) bySeverity[d.severity_code] += 1
        return {
          project_code: p.project_code,
          run_id: filter.run_id ?? null,
          total_run_cases: rows.length,
          counts: countStatuses(rows.map((r) => r.latest_status)),
          open_defects: openDefects.length,
          critical_high_open_defects: bySeverity.CRITICAL + bySeverity.HIGH,
          open_defects_by_severity: bySeverity,
          runs: runs
            .map(runSummary)
            .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? '')),
          recent_defects: projectDefects(p.id).slice(0, 5).map(defectListItem),
        }
      }),

    listTestCases: (code, query: TestCaseQuery = {}) =>
      delay(() => {
        const p = project(code)
        const q = query.q?.trim().toLowerCase()
        const items = db.cases
          .filter((c) => c.projectId === p.id)
          .filter((c) => !query.module || moduleDto(c.moduleId)?.module_code === query.module)
          .filter((c) => !query.priority || c.priority_code === query.priority)
          .filter((c) => !query.type || c.test_type_code === query.type)
          .filter((c) =>
            query.status ? c.case_status === query.status : c.case_status !== 'ARCHIVED',
          )
          .filter(
            (c) => !q || c.case_code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
          )
          .sort((a, b) => a.case_code.localeCompare(b.case_code))
          .map(caseListItem)
        return paginate(items, query)
      }),

    getTestCase: (code, caseId) =>
      delay((): TestCaseDetail => {
        const p = project(code)
        const c = db.cases.find((x) => x.id === caseId && x.projectId === p.id) ?? notFound()
        return {
          ...caseListItem(c),
          suite_name: c.suiteName,
          requirement_refs: c.requirement_refs,
          actor_label: c.actor_label,
          preconditions: c.preconditions,
          test_steps_text: c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          expected_result: c.expected_result,
          source_locale: 'id',
          source_kind: 'MANUAL',
          created_at: c.created_at,
          created_by: userRef(c.createdBy),
          steps: c.steps.map((instruction, i) => ({
            step_number: i + 1,
            instruction,
            expected_result: null,
          })),
          revisions: [...c.revisions]
            .sort((a, b) => b.revision_number - a.revision_number)
            .map((r) => ({
              revision_number: r.revision_number,
              changed_by: userRef(r.changedBy),
              change_reason: r.change_reason,
              changed_at: r.changed_at,
            })),
          used_in_runs: db.runCases
            .filter((rc) => rc.caseId === c.id)
            .map((rc) => {
              const run = db.runs.find((r) => r.id === rc.runId) as MockRun
              const attempts = attemptsOf(rc.id)
              return {
                run_id: run.id,
                run_code: run.run_code,
                run_name: run.name,
                run_case_id: rc.id,
                case_version: rc.case_version,
                latest_status: latestStatus(attempts),
                attempts: attempts.length,
              }
            }),
          files: attachedDtos(c.files),
          merged_into: (() => {
            const target = db.cases.find((x) => x.id === c.mergedInto)
            return target ? { id: target.id, case_code: target.case_code } : null
          })(),
          merged_from: db.cases
            .filter((x) => x.mergedInto === c.id)
            .map((x) => ({ id: x.id, case_code: x.case_code }))
            .sort((a, b) => a.case_code.localeCompare(b.case_code)),
        }
      }),

    listSimilarCases: (code, moduleCode) =>
      delay(() => {
        const p = project(code)
        const cases = db.cases
          .filter(
            (c) =>
              c.projectId === p.id &&
              c.case_status !== 'ARCHIVED' &&
              (!moduleCode || moduleDto(c.moduleId)?.module_code === moduleCode),
          )
          .map((c) => ({
            id: c.id,
            case_code: c.case_code,
            title: c.title,
            expected_result: c.expected_result || null,
            module_code: moduleDto(c.moduleId)?.module_code ?? null,
            case_status: c.case_status,
          }))
        return findSimilarPairs(cases).map(({ a, b, similarity }) => ({ ...similarity, a, b }))
      }),

    mergeTestCases: (code, input) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'case.archive')
        const parsed = testCaseMergeSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const target = caseIn(p.id, parsed.data.target_id)
        if (target.case_status === 'ARCHIVED') {
          fail(409, 'CONFLICT', 'target_id', 'ARCHIVED')
        }
        const sources = [...new Set(parsed.data.source_ids)].map((id) => caseIn(p.id, id))
        if (sources.some((s) => s.case_status === 'ARCHIVED')) {
          fail(409, 'CONFLICT', 'source_ids', 'ARCHIVED')
        }
        for (const source of sources) {
          source.case_status = 'ARCHIVED'
          source.mergedInto = target.id
          source.current_version += 1
          source.updated_at = now()
          addRevision(source, `Merged into ${target.case_code}`)
        }
        return {
          target: { id: target.id, case_code: target.case_code },
          merged: sources.map((s) => ({ id: s.id, case_code: s.case_code })),
        }
      }),

    listRuns: (code) =>
      delay(() => {
        const p = project(code)
        return db.runs
          .filter((r) => r.projectId === p.id)
          .map(runSummary)
          .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
      }),

    getRun: (code, runId) =>
      delay((): TestRunDetail => {
        const p = project(code)
        const run = db.runs.find((r) => r.id === runId && r.projectId === p.id) ?? notFound()
        return {
          ...runSummary(run),
          environment_url: run.environment_url,
          run_cases: runCaseRows(run),
        }
      }),

    listCycles: (code) =>
      delay(() => {
        const p = project(code)
        return db.cycles.filter((cy) => cy.projectId === p.id).map(cycleDto)
      }),
    createCycle: (code, input) =>
      delay(() => {
        const p = project(code)
        const parsed = cycleCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (db.cycles.some((cy) => cy.projectId === p.id && cy.cycle_code === data.cycle_code)) {
          fail(409, 'CONFLICT', 'cycle_code', 'Already used')
        }
        const cycle = {
          id: newId(),
          projectId: p.id,
          cycle_code: data.cycle_code,
          title: data.title,
          description: data.description ?? null,
          status_code: data.status_code,
          starts_on: data.starts_on ?? null,
          ends_on: data.ends_on ?? null,
        }
        db.cycles.push(cycle)
        return cycleDto(cycle)
      }),
    updateCycle: (code, cycleId, input) =>
      delay(() => {
        const p = project(code)
        const cycle =
          db.cycles.find((cy) => cy.id === cycleId && cy.projectId === p.id) ?? notFound()
        const parsed = cycleUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const nextCode = parsed.data.cycle_code
        if (
          nextCode &&
          db.cycles.some(
            (cy) => cy.projectId === p.id && cy.id !== cycle.id && cy.cycle_code === nextCode,
          )
        ) {
          fail(409, 'CONFLICT', 'cycle_code', 'Already used')
        }
        Object.assign(
          cycle,
          Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)),
        )
        return cycleDto(cycle)
      }),

    createRun: (code, input) =>
      delay(() => {
        const p = project(code)
        const parsed = runCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const prefix = `RUN-${now().slice(0, 10).replace(/-/g, '')}-`
        const n =
          db.runs.filter((r) => r.projectId === p.id && r.run_code.startsWith(prefix)).length + 1
        const runCode = data.run_code ?? `${prefix}${n}`
        if (db.runs.some((r) => r.projectId === p.id && r.run_code === runCode)) {
          fail(409, 'CONFLICT', 'run_code', 'Already used')
        }
        const run: MockRun = {
          id: newId(),
          projectId: p.id,
          cycleId: data.cycle_id ?? '',
          run_code: runCode,
          name: data.name,
          environment_name: data.environment_name ?? '',
          build_version: data.build_version ?? '',
          environment_url: data.environment_url ?? '',
          status_code: 'PLANNED',
          starts_at: null,
          ends_at: null,
        }
        db.runs.push(run)
        return runSummary(run)
      }),
    updateRun: (code, runId, input) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        assertRunEditable(run, true)
        const parsed = runUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (data.name) run.name = data.name
        if (data.cycle_id !== undefined) run.cycleId = data.cycle_id ?? ''
        if (data.environment_name !== undefined) run.environment_name = data.environment_name ?? ''
        if (data.build_version !== undefined) run.build_version = data.build_version ?? ''
        if (data.environment_url !== undefined) run.environment_url = data.environment_url ?? ''
        return runSummary(run)
      }),
    changeRunStatus: (code, runId, status) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        if (!canTransitionRun(run.status_code, status)) {
          fail(409, 'CONFLICT', 'status_code', `Invalid transition ${run.status_code} -> ${status}`)
        }
        run.status_code = status
        if (status === 'ACTIVE') {
          run.starts_at ??= now()
          run.ends_at = null
        }
        if (status === 'COMPLETED') run.ends_at = now()
        return runSummary(run)
      }),
    addRunCases: (code, runId, input) =>
      delay(() => {
        const p = project(code)
        const run = runIn(p.id, runId)
        assertRunEditable(run)
        assertAssignee(p.id, input.assigned_to)
        const result: AddRunCasesResult = { added: 0, skipped: [] }
        let order = Math.max(
          0,
          ...db.runCases.filter((rc) => rc.runId === runId).map((rc) => rc.sort_order),
        )
        for (const caseId of [...new Set(input.test_case_ids)]) {
          const testCase = db.cases.find((c) => c.id === caseId && c.projectId === p.id)
          if (!testCase) result.skipped.push({ test_case_id: caseId, reason: 'NOT_FOUND' })
          else if (testCase.case_status !== 'READY')
            result.skipped.push({ test_case_id: caseId, reason: 'NOT_READY' })
          else if (db.runCases.some((rc) => rc.runId === runId && rc.caseId === caseId)) {
            result.skipped.push({ test_case_id: caseId, reason: 'ALREADY_IN_RUN' })
          } else {
            order += 1
            db.runCases.push({
              id: newId(),
              runId,
              caseId,
              assignedTo: input.assigned_to ?? null,
              case_version: testCase.current_version,
              sort_order: order,
              snapshot: snapshotOfCase(testCase),
            })
            result.added += 1
          }
        }
        return result
      }),
    removeRunCase: (code, runId, runCaseId) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        assertRunEditable(run)
        const index = db.runCases.findIndex((rc) => rc.id === runCaseId && rc.runId === runId)
        if (index < 0) notFound()
        if (attemptsOf(runCaseId).length > 0) {
          conflict('This case already has test results and cannot be removed from the run.')
        }
        db.runCases.splice(index, 1)
      }),
    assignRunCases: (code, runId, input) =>
      delay(() => {
        const p = project(code)
        const run = runIn(p.id, runId)
        assertRunEditable(run, true)
        assertAssignee(p.id, input.assigned_to)
        let updated = 0
        for (const rc of db.runCases) {
          if (rc.runId === runId && input.run_case_ids.includes(rc.id)) {
            rc.assignedTo = input.assigned_to
            updated += 1
          }
        }
        return { updated }
      }),
    getRunCase: (code, runCaseId) =>
      delay((): RunCaseDetail => {
        const p = project(code)
        const rc = db.runCases.find((x) => x.id === runCaseId) ?? notFound()
        const run = runIn(p.id, rc.runId)
        const testCase = db.cases.find((c) => c.id === rc.caseId) ?? notFound()
        const attempts = attemptsOf(rc.id).sort((a, b) => b.attempt_number - a.attempt_number)
        const executionIds = new Set(attempts.map((e) => e.id))
        const siblings = db.runCases
          .filter((x) => x.runId === run.id)
          .sort((a, b) => a.sort_order - b.sort_order)
        const index = siblings.findIndex((x) => x.id === rc.id)
        return {
          run_case_id: rc.id,
          test_case_id: testCase.id,
          run: {
            id: run.id,
            run_code: run.run_code,
            name: run.name,
            status_code: run.status_code,
            environment_name: run.environment_name || null,
            build_version: run.build_version || null,
            environment_url: run.environment_url || null,
          },
          case_version: rc.case_version,
          current_case_version: testCase.current_version,
          snapshot: rc.snapshot ?? snapshotOfCase(testCase),
          assigned_to: userRef(rc.assignedTo),
          latest_status: latestStatus(attempts),
          attempts: attempts.map(executionDto),
          linked_defects: db.defects
            .filter((d) => d.executionIds.some((id) => executionIds.has(id)))
            .map((d) => ({
              id: d.id,
              bug_code: d.bug_code,
              title: d.title,
              status_code: d.status_code,
              severity_code: d.severity_code,
            })),
          previous_run_case_id: siblings[index - 1]?.id ?? null,
          next_run_case_id: siblings[index + 1]?.id ?? null,
        }
      }),
    createExecution: (code, runCaseId, input, idempotencyKey) =>
      delay(() => {
        const replayKey = `${runCaseId}:${idempotencyKey}`
        const replay = replays.get(replayKey)
        if (replay) return replay
        const p = project(code)
        const rc = db.runCases.find((x) => x.id === runCaseId) ?? notFound()
        const run = runIn(p.id, rc.runId)
        if (run.status_code !== 'ACTIVE')
          conflict('Tests can only be recorded while the run is ACTIVE.')
        const role = roleIn(p.id)
        if (
          !superAdmins.has(db.currentUserId) &&
          role === 'TESTER' &&
          rc.assignedTo !== db.currentUserId
        ) {
          throw new ApiClientError(
            403,
            'FORBIDDEN',
            'This test case is assigned to someone else.',
            'mock-request',
          )
        }
        if (!['ADMIN', 'QA_LEAD', 'TESTER'].includes(role) && !superAdmins.has(db.currentUserId)) {
          throw new ApiClientError(403, 'FORBIDDEN', 'Not allowed.', 'mock-request')
        }
        const parsed = executionCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const attempt = attemptsOf(runCaseId).reduce((m, e) => Math.max(m, e.attempt_number), 0) + 1
        const execution: MockExecution = {
          id: newId(),
          runCaseId,
          attempt_number: attempt,
          execution_kind:
            attempt === 1 ? ('INITIAL' as const) : (data.execution_kind ?? ('RETEST' as const)),
          result_status: data.result_status,
          actual_result: data.actual_result ?? null,
          notes: data.notes ?? null,
          testerId: db.currentUserId,
          tested_at: now(),
          browser_name: data.browser_name ?? null,
          device_name: data.device_name ?? null,
          operating_system: data.operating_system ?? null,
          step_results: (data.step_results ?? []).map((s) => ({
            step_number: s.step_number,
            result_status: s.result_status,
            actual_result: s.actual_result ?? null,
          })),
        }
        if (data.evidence?.length) {
          assertMockAttachable(p.id, data.evidence)
          addLinks(execution, data.evidence)
        }
        db.executions.push(execution)
        const dto = executionDto(execution)
        replays.set(replayKey, dto)
        return dto
      }),

    listDefects: (code, query: DefectQuery = {}) =>
      delay(() => {
        const p = project(code)
        const q = query.q?.trim().toLowerCase()
        const items = projectDefects(p.id)
          .filter((d) =>
            !query.status
              ? true
              : query.status === 'open'
                ? isOpenDefect(d.status_code)
                : d.status_code === query.status,
          )
          .filter((d) => !query.severity || d.severity_code === query.severity)
          .filter((d) => !query.priority || d.priority_code === query.priority)
          .filter(
            (d) =>
              !query.assigned_to ||
              (query.assigned_to === 'none'
                ? d.assignedTo === null
                : d.assignedTo === query.assigned_to),
          )
          .filter(
            (d) =>
              !query.cycle || (query.cycle === 'none' ? !d.cycleId : d.cycleId === query.cycle),
          )
          .filter(
            (d) => !q || d.bug_code.toLowerCase().includes(q) || d.title.toLowerCase().includes(q),
          )
          .map(defectListItem)
        return paginate(items, query)
      }),

    getDefect: (code, defectId) => delay(() => defectDetail(defectIn(project(code).id, defectId))),

    createDefect: (code, input, idempotencyKey) =>
      delay(() => {
        const p = project(code)
        const replayKey = `${p.id}:${db.currentUserId}:${idempotencyKey}`
        const replay = defectReplays.get(replayKey)
        if (replay) return replay
        requireRole(p.id, 'defect.create')
        const parsed = defectCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const role = effectiveRole(p.id)
        if (data.assigned_to && role !== 'ADMIN' && role !== 'QA_LEAD') {
          forbidden('Only an ADMIN or QA_LEAD can assign a bug.', ['assigned_to'])
        }
        assertDefectModule(p.id, data.module_id)
        assertDefectCycle(p.id, data.cycle_id)
        assertDefectAssignee(p.id, data.assigned_to)
        const executionIds = [...new Set(data.execution_ids ?? [])]
        if (executionIds.some((id) => !executionInProject(p.id, id))) {
          fail(422, 'VALIDATION_ERROR', 'execution_ids', 'Test attempt not found in this project')
        }
        if (data.evidence?.length) assertMockAttachable(p.id, data.evidence)
        const bugCode = data.bug_code ?? nextBugCode(p)
        if (db.defects.some((d) => d.projectId === p.id && d.bug_code === bugCode)) {
          fail(409, 'CONFLICT', 'bug_code', 'Already used')
        }
        const at = now()
        const defect: MockDefect = {
          id: newId(),
          projectId: p.id,
          moduleId: data.module_id ?? null,
          // Found in a test attempt and no cycle chosen: follow the run's cycle.
          cycleId:
            data.cycle_id ??
            (() => {
              const exec = db.executions.find((e) => e.id === executionIds[0])
              const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
              return db.runs.find((r) => r.id === rc?.runId)?.cycleId ?? null
            })(),
          bug_code: bugCode,
          title: data.title,
          description: data.description ?? '',
          steps_to_reproduce: data.steps_to_reproduce ?? '',
          expected_behavior: data.expected_behavior ?? '',
          actual_behavior: data.actual_behavior ?? '',
          severity_code: data.severity_code,
          priority_code: data.priority_code,
          status_code: 'OPEN',
          source_kind: data.source_kind,
          environment_name: data.environment_name ?? '',
          build_version: data.build_version ?? '',
          browser_name: data.browser_name ?? '',
          fixed_in_version: data.fixed_in_version ?? null,
          reportedBy: db.currentUserId,
          assignedTo: data.assigned_to ?? null,
          created_at: at,
          updated_at: at,
          executionIds,
          history: [{ from: null, to: 'OPEN', by: db.currentUserId, comment: null, at }],
          comments: [],
        }
        if (data.evidence?.length) addLinks(defect, data.evidence)
        db.defects.push(defect)
        const dto = defectDetail(defect)
        defectReplays.set(replayKey, dto)
        return dto
      }),

    updateDefect: (code, defectId, input) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.update')
        const parsed = defectUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (
          data.expected_updated_at &&
          new Date(data.expected_updated_at).toISOString() !== d.updated_at
        ) {
          conflict('This bug was changed by someone else. Reload to see the latest version.')
        }
        const requested = DEFECT_FIELDS.filter((field) => data[field] !== undefined)
        const allowed = defectEditableFields(defectActor(p.id, d))
        const denied = requested.filter((field) => !allowed.includes(field))
        if (denied.length > 0) forbidden('You cannot change these fields of this bug.', denied)
        const changed = requested.filter(
          (field) => String(d[DEFECT_PROP[field]] ?? '') !== String(data[field] ?? ''),
        )
        if (changed.length === 0) return defectDetail(d)
        if (changed.includes('module_id')) assertDefectModule(p.id, data.module_id)
        if (changed.includes('cycle_id')) assertDefectCycle(p.id, data.cycle_id)
        if (changed.includes('assigned_to')) assertDefectAssignee(p.id, data.assigned_to)
        const target = d as unknown as Record<string, unknown>
        for (const field of changed) {
          const prop = DEFECT_PROP[field]
          target[prop] = data[field] ?? (NULLABLE_PROPS.has(prop) ? null : '')
        }
        d.updated_at = now()
        return defectDetail(d)
      }),

    changeDefectStatus: (code, defectId, change) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.update')
        const parsed = defectStatusSchema.safeParse(change)
        if (!parsed.success) return validationError(parsed.error.issues)
        const { status_code: to, expected_status, comment, fixed_in_version } = parsed.data
        const from = d.status_code
        if (expected_status && expected_status !== from) {
          fail(409, 'CONFLICT', 'status_code', `Current status is ${from}`)
        }
        if (!canTransitionDefect(from, to)) {
          fail(409, 'CONFLICT', 'status_code', `Invalid transition ${from} -> ${to}`)
        }
        if (!canTransitionDefect(from, to, defectActor(p.id, d))) {
          forbidden('Your role cannot move this bug to that status.')
        }
        const at = now()
        d.status_code = to
        if ((to === 'FIXED' || to === 'READY_FOR_RETEST') && fixed_in_version) {
          d.fixed_in_version = fixed_in_version
        }
        d.history.push({ from, to, by: db.currentUserId, comment: comment ?? null, at })
        d.updated_at = at
        return defectDetail(d)
      }),

    addDefectComment: (code, defectId, body) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.comment')
        const parsed = defectCommentSchema.safeParse({ body })
        if (!parsed.success) return validationError(parsed.error.issues)
        const comment = {
          id: newId(),
          authorId: db.currentUserId,
          body: parsed.data.body,
          created_at: now(),
        }
        d.comments.push(comment)
        return {
          id: comment.id,
          author: userRef(comment.authorId),
          body: comment.body,
          created_at: comment.created_at,
        }
      }),

    linkDefectExecution: (code, defectId, executionId) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.link')
        if (!executionInProject(p.id, executionId)) {
          fail(422, 'VALIDATION_ERROR', 'execution_ids', 'Test attempt not found in this project')
        }
        if (!d.executionIds.includes(executionId)) d.executionIds.push(executionId)
        return defectDetail(d)
      }),

    unlinkDefectExecution: (code, defectId, executionId) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.link')
        const index = d.executionIds.indexOf(executionId)
        if (index < 0) notFound()
        d.executionIds.splice(index, 1)
        return defectDetail(d)
      }),
    uploadFile: async (code, file, options = {}) => {
      const p = project(code)
      requireRole(p.id, 'file.upload')
      const type = evidenceTypeFor(file.name)
      if (!type) {
        return delay(() => ({
          files: [],
          rejected: [{ original_filename: file.name, failure_reason: 'TYPE_NOT_ALLOWED' as const }],
        }))
      }
      const ext = extensionOf(file.name)
      const head = await readHead(file)
      let reason: FileFailureReason | null = null
      const signature = SIGNATURES[ext]
      if (file.size === 0) reason = 'EMPTY'
      else if (file.size > EVIDENCE_RULES[type].maxBytes) reason = 'TOO_LARGE'
      else if (signature && !signature.every((byte, i) => head[i] === byte)) {
        reason = 'SIGNATURE_MISMATCH'
      } else if (!signature && head.includes(0)) reason = 'NOT_TEXT'
      if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      options.onProgress?.(1)
      const mime = file.type || 'application/octet-stream'
      const f: MockFile = {
        id: newId(),
        projectId: p.id,
        evidence_type: type,
        original_filename: file.name,
        original_mime: mime,
        stored_mime: mime,
        original_size_bytes: file.size,
        stored_size_bytes: null,
        compression_method: null,
        compression_note: null,
        processing_status: reason ? 'REJECTED' : 'PROCESSING',
        scan_status: 'PENDING',
        scan_engine: null,
        failure_reason: reason,
        uploadedBy: db.currentUserId,
        uploaded_at: now(),
        processed_at: reason ? now() : null,
        deleted: false,
        url: reason ? null : objectUrl(file),
      }
      db.files.push(f)
      // The answer reflects the moment of upload; checking finishes a little later.
      const created = fileDto(f)
      if (!reason) setTimeout(() => finishProcessing(f, ext), Math.max(latencyMs * 3, 60))
      return delay(() => ({ files: [created], rejected: [] }))
    },

    getFileStatus: (code, fileId) => delay(() => fileDto(fileIn(project(code).id, fileId))),

    listFiles: (code, query: FileQuery = {}) =>
      delay(() => {
        const p = project(code)
        const q = query.q?.trim().toLowerCase()
        const items = db.files
          .filter((f) => f.projectId === p.id && !f.deleted)
          .filter((f) => !query.type || f.evidence_type === query.type)
          .filter((f) => !query.status || f.processing_status === query.status)
          .filter((f) => !q || f.original_filename.toLowerCase().includes(q))
          .map((f): EvidenceItem => ({ ...fileDto(f), usages: usagesOfFile(f.id) }))
          .filter((f) => !query.unlinked || f.usages.length === 0)
          .reverse()
        return paginate(items, query)
      }),

    deleteFile: (code, fileId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'file.upload')
        const f = fileIn(p.id, fileId)
        if (!isLeadIn(p.id) && f.uploadedBy !== db.currentUserId) {
          forbidden('Only the uploader or a lead can remove this file.')
        }
        if (usagesOfFile(f.id).length > 0) {
          conflict('This file is attached as evidence and cannot be removed.')
        }
        f.deleted = true
      }),

    fileUrl: (_code, fileId) => db.files.find((f) => f.id === fileId)?.url ?? '',

    attachExecutionFiles: (code, executionId, refs) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'file.upload')
        const e = db.executions.find((x) => x.id === executionId) ?? notFound()
        const rc = db.runCases.find((x) => x.id === e.runCaseId)
        const run = runIn(p.id, rc?.runId ?? '')
        if (!isLeadIn(p.id) && e.testerId !== db.currentUserId) {
          forbidden('Only the tester of this attempt can add evidence.')
        }
        if (run.status_code === 'LOCKED') conflict('The run is locked and cannot be changed.')
        assertMockAttachable(p.id, refs)
        addLinks(e, refs)
        return attachedDtos(e.files)
      }),

    detachExecutionFile: (code, executionId, fileId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'run.write')
        const e = db.executions.find((x) => x.id === executionId) ?? notFound()
        const rc = db.runCases.find((x) => x.id === e.runCaseId)
        if (runIn(p.id, rc?.runId ?? '').status_code === 'LOCKED') {
          conflict('The run is locked and cannot be changed.')
        }
        removeLink(e, fileId)
      }),

    attachDefectFiles: (code, defectId, refs) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'file.upload')
        const d = defectIn(p.id, defectId)
        const actor = defectActor(p.id, d)
        if (actor.role === 'DEVELOPER' && !actor.isAssignee) {
          forbidden('Only the assigned developer can add evidence.')
        }
        assertMockAttachable(p.id, refs)
        addLinks(d, refs)
        return defectDetail(d)
      }),

    detachDefectFile: (code, defectId, fileId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'file.upload')
        const d = defectIn(p.id, defectId)
        const f = db.files.find((x) => x.id === fileId)
        if (!isLeadIn(p.id) && f?.uploadedBy !== db.currentUserId) {
          forbidden('Only the uploader or a lead can detach this file.')
        }
        removeLink(d, fileId)
        return defectDetail(d)
      }),

    attachCaseFiles: (code, caseId, refs) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'case.write')
        const c = db.cases.find((x) => x.id === caseId && x.projectId === p.id) ?? notFound()
        assertMockAttachable(p.id, refs)
        addLinks(c, refs)
        return attachedDtos(c.files)
      }),

    detachCaseFile: (code, caseId, fileId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'case.write')
        const c = db.cases.find((x) => x.id === caseId && x.projectId === p.id) ?? notFound()
        removeLink(c, fileId)
      }),
    uploadImport: async (code, file, options = {}) => {
      const p = project(code)
      requireRole(p.id, 'import.manage')
      const ext = extensionOf(file.name)
      if (ext === 'xlsx') {
        // Workbooks need the server-side reader (images, merged cells, zip checks).
        fail(422, 'VALIDATION_ERROR', 'file', 'DEMO_XLSX')
      }
      if (ext !== 'csv' && ext !== 'json') fail(422, 'VALIDATION_ERROR', 'file', 'TYPE_NOT_ALLOWED')
      if (file.size === 0) fail(422, 'VALIDATION_ERROR', 'file', 'EMPTY')
      const text = await readText(file)
      options.onProgress?.(1)
      let sheets: PlanSheet[]
      let kind: ImportSourceKind = 'MANUAL'
      const defaults: MockImportJob['defaults'] = {}
      if (ext === 'csv') {
        const rows = parseCsv(text)
        if (rows.length === 0) fail(422, 'VALIDATION_ERROR', 'file', 'EMPTY')
        sheets = [{ name: 'CSV', rows, hiddenRows: [], images: [] }]
      } else {
        let json: unknown
        try {
          json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
        } catch {
          return fail(422, 'VALIDATION_ERROR', 'file', 'INVALID_JSON')
        }
        const parsed = aiImportSchema.safeParse(json)
        if (!parsed.success) return fail(422, 'VALIDATION_ERROR', 'file', 'SCHEMA_MISMATCH')
        kind = parsed.data.source_kind
        defaults.suite_name = parsed.data.suite_name
        defaults.source_locale = parsed.data.source_locale
        const header: string[] = [...CASE_IMPORT_FIELDS]
        const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v))
        sheets = [
          {
            name: 'JSON',
            rows: [header, ...parsed.data.cases.map((c) => header.map((key) => cell(c[key])))],
            hiddenRows: [],
            images: [],
          },
        ]
      }
      const job: MockImportJob = {
        target: options.target === 'DEFECTS' ? 'DEFECTS' : 'TEST_CASES',
        defectConfig: null,
        defectRows: [],
        defectPreview: null,
        defectResult: null,
        id: newId(),
        projectId: p.id,
        filename: file.name,
        format: ext === 'csv' ? 'CSV' : 'JSON',
        kind,
        status: 'UPLOADED',
        sheets,
        defaults,
        config: null,
        rows: [],
        preview: null,
        result: null,
        createdBy: db.currentUserId,
        created_at: now(),
        completed_at: null,
      }
      importJobs.push(job)
      return delay(() => importDto(job))
    },

    listImports: (code, query: PageQuery = {}) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        return paginate(
          importJobs
            .filter((j) => j.projectId === p.id)
            .reverse()
            .map(importDto),
          query,
        )
      }),

    getImport: (code, jobId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        return importDto(importJobIn(p.id, jobId))
      }),

    configureImport: (code, jobId, input) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        const job = importJobIn(p.id, jobId)
        if (job.status !== 'UPLOADED' && job.status !== 'PREVIEW') {
          conflict('This import can no longer be changed.')
        }
        const parsed = importConfigSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const config = parsed.data as ImportConfig
        const { rows, images, codes } = planRows(job.sheets, config, job.defaults)
        const existing = new Map<string, ExistingCase>()
        for (const c of db.cases) {
          if (c.projectId === p.id && codes.includes(c.case_code)) {
            existing.set(c.case_code, {
              id: c.id,
              case_status: c.case_status,
              values: checkedOf(c),
            })
          }
        }
        const modules = new Set(
          db.modules.filter((m) => m.projectId === p.id).map((m) => m.module_code),
        )
        const knownSuites = new Set(
          suites
            .filter((s) => s.projectId === p.id)
            .map((s) => `${moduleDto(s.moduleId)?.module_code ?? ''}|${s.name}`),
        )
        job.preview = finishPlan(rows, images, config, existing, modules, knownSuites)
        job.rows = rows.map((row) => ({ ...row, id: newId() }))
        job.config = config
        job.status = 'PREVIEW'
        return importDto(job)
      }),

    configureDefectImport: (code, jobId, input) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        const job = importJobIn(p.id, jobId)
        if (job.target !== 'DEFECTS') conflict('This is not a bug import.')
        if (job.status !== 'UPLOADED' && job.status !== 'PREVIEW') {
          conflict('This import can no longer be changed.')
        }
        const parsed = defectImportConfigSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const plan = planDefectRows(
          job.sheets,
          parsed.data,
          new Set(db.defects.filter((d) => d.projectId === p.id).map((d) => d.bug_code)),
          new Set(db.modules.filter((m) => m.projectId === p.id).map((m) => m.module_code)),
        )
        job.defectConfig = parsed.data
        job.defectRows = plan.rows.map((row) => ({ ...row, id: newId() }))
        job.defectPreview = plan.preview
        job.status = 'PREVIEW'
        return importDto(job)
      }),

    listImportRows: (code, jobId, query: ImportRowQuery = {}) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        const job = importJobIn(p.id, jobId)
        if (job.target === 'DEFECTS') {
          const state = (row: MockImportJob['defectRows'][number]) => row.final ?? row.status
          const items = job.defectRows
            .filter((row) =>
              !query.status
                ? true
                : query.status === 'ok'
                  ? state(row) === 'VALID' && row.issues.length === 0
                  : query.status === 'review'
                    ? state(row) === 'VALID' && row.issues.length > 0
                    : state(row) === query.status,
            )
            .map((row): ImportRowDto => ({
              id: row.id,
              sheet_name: row.sheet,
              source_row_number: row.row,
              external_case_code: row.values.bug_code ?? row.values.case_code,
              status_code: state(row),
              action: row.action,
              title: row.values.title,
              module_code: row.values.module_code,
              result_status: null,
              issues: row.issues as ImportRowDto['issues'],
              duplicate_of: row.duplicate_of,
              target_test_case_id: null,
              image_count: row.images.length,
            }))
          return paginate(items, query)
        }
        const state = (row: MockImportJob['rows'][number]) => row.final ?? row.status
        const items = job.rows
          .filter((row) =>
            !query.status
              ? true
              : query.status === 'ok'
                ? state(row) === 'VALID' && row.issues.length === 0
                : query.status === 'review'
                  ? state(row) === 'VALID' && row.issues.length > 0
                  : state(row) === query.status,
          )
          .map((row): ImportRowDto => ({
            id: row.id,
            sheet_name: row.sheet,
            source_row_number: row.row,
            external_case_code: row.values.case_code,
            status_code: state(row),
            action: row.action,
            title: row.values.title,
            module_code: row.values.module_code,
            result_status:
              row.result.status && row.result.status !== 'IGNORE' ? row.result.status : null,
            issues: row.issues,
            duplicate_of: row.duplicate_of,
            target_test_case_id: row.target_id,
            image_count: row.images.length,
          }))
        return paginate(items, query)
      }),

    commitImport: (code, jobId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        const job = importJobIn(p.id, jobId)
        if (job.status !== 'PREVIEW') conflict('This import is not ready to be applied.')
        job.status = 'IMPORTING'
        const answer = importDto(job)
        setTimeout(
          () => (job.target === 'DEFECTS' ? applyDefectImport(job) : applyImport(job)),
          Math.max(latencyMs * 2, 30),
        )
        return answer
      }),

    deleteImport: (code, jobId) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'import.manage')
        const job = importJobIn(p.id, jobId)
        if (!['UPLOADED', 'PREVIEW', 'FAILED'].includes(job.status)) {
          conflict('An applied import is kept as history.')
        }
        importJobs.splice(importJobs.indexOf(job), 1)
      }),

    importUrl: () => '',

    // ---- Milestone 7: reports (same scope rules as the API) -------------------------
    getReportOverview: (code, filter) =>
      delay(() => {
        const p = project(code)
        const parsed = reportFilterSchema.safeParse(filter)
        if (!parsed.success) validationError(parsed.error.issues)
        return mockReportOverview(db, p, parsed.data)
      }),

    exportReport: (code, query) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'report.export')
        const parsed = reportExportSchema.safeParse(query)
        if (!parsed.success) validationError(parsed.error.issues)
        const { dataset, format, locale, ...filter } = parsed.data
        const records = mockReportRecords(db, p.id, dataset, filter)
        const table = reportTable(dataset, records, locale)
        sessionAudit.push({
          id: `export-${sessionAudit.length + 1}`,
          projectId: p.id,
          actorId: db.currentUserId,
          entity_type: 'report',
          entity_id: p.id,
          action_code: 'EXPORT',
          newValues: { dataset, format, filters: filter, rows: records.length },
          at: now(),
        })
        const blob =
          format === 'csv'
            ? new Blob([toCsv(table.header, table.rows)], { type: CSV_MIME })
            : new Blob(
                [
                  buildXlsx([
                    {
                      name: REPORT_SHEET_NAMES[dataset][locale],
                      header: table.header,
                      rows: table.rows,
                    },
                  ]),
                ],
                { type: XLSX_MIME },
              )
        return { blob, filename: reportFileName(p.project_code, dataset, format) }
      }),

    listAuditLogs: (code, query = {}) =>
      delay(() => {
        const p = project(code)
        requireRole(p.id, 'audit.read')
        const { page, page_size, ...rest } = query
        const parsed = auditFilterSchema.safeParse(rest)
        if (!parsed.success) validationError(parsed.error.issues)
        const f = parsed.data
        const start = f.from ? wibDayStart(f.from).toISOString() : null
        const end = f.to ? wibDayEnd(f.to).toISOString() : null
        const entries = mockAuditLog(db, p.id, sessionAudit).filter(
          (e) =>
            (!f.entity_type || e.entity_type === f.entity_type) &&
            (!f.action || e.action_code === f.action) &&
            (!f.actor_id || e.actor?.id === f.actor_id) &&
            (!start || e.created_at >= start) &&
            (!end || e.created_at < end),
        )
        return paginate(entries, { page, page_size })
      }),

    // ---- Admin console (demo; same rules as the API, ADR 0011) ------------------------
    createProject: (input) =>
      delay(() => {
        requireSuperAdmin()
        const parsed = projectCreateSchema.safeParse(input)
        if (!parsed.success) validationError(parsed.error.issues)
        const value = parsed.data
        if (db.projects.some((p) => p.project_code === value.project_code)) {
          fail(409, 'CONFLICT', 'project_code', 'Already used')
        }
        const created = {
          id: newId(),
          project_code: value.project_code,
          name: value.name,
          description: value.description ?? '',
          bugPrefix: value.project_code.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'BUG',
          members: [{ userId: db.currentUserId, role: 'ADMIN' as const }],
          createdAt: now(),
          createdBy: db.currentUserId,
        }
        db.projects.push(created)
        siteAudit(created.id, 'project', created.id, 'CREATE', undefined, {
          project_code: value.project_code,
          name: value.name,
        })
        return projectSummary(created)
      }),

    listAdminProjects: () =>
      delay(() => {
        requireSuperAdmin()
        return [...db.projects]
          .sort(
            (a, b) =>
              Number(Boolean(a.archived)) - Number(Boolean(b.archived)) ||
              a.project_code.localeCompare(b.project_code),
          )
          .map(adminProject)
      }),

    updateAdminProject: (projectId, input) =>
      delay(() => {
        requireSuperAdmin()
        const parsed = adminProjectUpdateSchema.safeParse(input)
        if (!parsed.success) validationError(parsed.error.issues)
        const target = db.projects.find((p) => p.id === projectId) ?? notFound()
        const before = {
          project_code: target.project_code,
          name: target.name,
          description: target.description,
          is_archived: Boolean(target.archived),
        }
        const nextCode = parsed.data.project_code
        if (
          nextCode &&
          db.projects.some((p) => p.id !== target.id && p.project_code === nextCode)
        ) {
          fail(409, 'CONFLICT', 'project_code', 'Already used')
        }
        if (nextCode) target.project_code = nextCode
        if (parsed.data.name !== undefined) target.name = parsed.data.name
        if (parsed.data.description !== undefined)
          target.description = parsed.data.description ?? ''
        if (parsed.data.is_archived !== undefined) target.archived = parsed.data.is_archived
        siteAudit(
          target.id,
          'project',
          target.id,
          parsed.data.is_archived === true ? 'ARCHIVE' : 'UPDATE',
          before,
          parsed.data,
        )
        return adminProject(target)
      }),

    getSiteSettings: () =>
      delay((): SiteSettingsDto => {
        requireSuperAdmin()
        return { values: { ...siteSettings }, changed: { ...settingsChanged } }
      }),

    updateSiteSettings: (input) =>
      delay((): SiteSettingsDto => {
        requireSuperAdmin()
        const parsed = siteSettingsUpdateSchema.safeParse(input)
        if (!parsed.success) validationError(parsed.error.issues)
        const keys = (Object.keys(parsed.data) as SiteSettingKey[]).filter(
          (key) => JSON.stringify(parsed.data[key]) !== JSON.stringify(siteSettings[key]),
        )
        if (keys.length > 0) {
          const before = Object.fromEntries(keys.map((key) => [key, siteSettings[key]]))
          siteSettings = { ...siteSettings, ...parsed.data }
          for (const key of keys) {
            settingsChanged[key] = { at: now(), by: userRef(db.currentUserId) }
          }
          siteAudit(
            '',
            'system_setting',
            '0',
            'UPDATE',
            before,
            Object.fromEntries(keys.map((key) => [key, siteSettings[key]])),
          )
        }
        return { values: { ...siteSettings }, changed: { ...settingsChanged } }
      }),

    getPublicSettings: () =>
      delay(
        (): PublicSiteSettings =>
          Object.fromEntries(
            PUBLIC_SITE_SETTING_KEYS.map((key) => [key, siteSettings[key]]),
          ) as PublicSiteSettings,
      ),

    listSiteAuditLogs: (query = {}) =>
      delay(() => {
        requireSuperAdmin()
        const { page, page_size, ...rest } = query
        const parsed = auditFilterSchema.safeParse(rest)
        if (!parsed.success) validationError(parsed.error.issues)
        const f = parsed.data
        const start = f.from ? wibDayStart(f.from).toISOString() : null
        const end = f.to ? wibDayEnd(f.to).toISOString() : null
        const projectEntries: AuditLogEntry[] = db.projects.flatMap((p) =>
          mockAuditLog(db, p.id, sessionAudit).map((entry) => ({
            ...entry,
            project: { id: p.id, project_code: p.project_code },
          })),
        )
        const siteEntries: AuditLogEntry[] = mockAuditLog(db, '', sessionAudit).map((entry) => ({
          ...entry,
          project: null,
        }))
        const entries = [...projectEntries, ...siteEntries]
          .filter(
            (e) =>
              (!f.project ||
                (f.project === 'site' ? e.project === null : e.project?.id === f.project)) &&
              (!f.entity_type || e.entity_type === f.entity_type) &&
              (!f.action || e.action_code === f.action) &&
              (!f.actor_id || e.actor?.id === f.actor_id) &&
              (!start || e.created_at >= start) &&
              (!end || e.created_at < end),
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        return paginate(entries, { page, page_size })
      }),

    ...recovery.methods,

    // ---- Bulk actions (ADR 0013): each item through the single-item rules -----------
    bulkDefects: async (code, input) => {
      const parsed = defectBulkSchema.safeParse(input)
      if (!parsed.success) return validationError(parsed.error.issues)
      const body = parsed.data
      const p = project(code)
      requireRole(p.id, 'defect.update')
      if (
        body.action === 'status' &&
        DEFECT_REASON_REQUIRED.includes(body.status_code) &&
        !body.comment
      ) {
        fail(422, 'VALIDATION_ERROR', 'comment', 'A reason is required')
      }
      if (body.action === 'update') {
        assertDefectModule(p.id, body.changes.module_id)
        assertDefectCycle(p.id, body.changes.cycle_id)
        assertDefectAssignee(p.id, body.changes.assigned_to)
      }
      return runBulk(body.defect_ids, async (id) => {
        const d = db.defects.find((x) => x.id === id && x.projectId === p.id)
        if (!d) return { code: '', outcome: 'NOT_FOUND' }
        const before = JSON.stringify(defectListItem(d))
        if (body.action === 'status' && d.status_code === body.status_code) {
          return { code: d.bug_code, outcome: 'unchanged' }
        }
        if (body.action === 'update') await api.updateDefect(code, id, body.changes)
        else {
          await api.changeDefectStatus(code, id, {
            status_code: body.status_code,
            comment: body.comment ?? undefined,
          })
        }
        return {
          code: d.bug_code,
          outcome: JSON.stringify(defectListItem(d)) === before ? 'unchanged' : 'updated',
        }
      })
    },

    bulkTestCases: async (code, input) => {
      const parsed = caseBulkSchema.safeParse(input)
      if (!parsed.success) return validationError(parsed.error.issues)
      const body = parsed.data
      const p = project(code)
      requireRole(p.id, body.action === 'archive' ? 'case.archive' : 'case.write')
      if (body.action === 'set_module' && moduleIdByCode(p.id, body.module_code) === undefined) {
        fail(422, 'VALIDATION_ERROR', 'module_code', 'Module not found in this project')
      }
      return runBulk(body.case_ids, async (id) => {
        const c = db.cases.find((x) => x.id === id && x.projectId === p.id)
        if (!c) return { code: '', outcome: 'NOT_FOUND' }
        const before = c.current_version
        if (body.action === 'archive') await api.archiveTestCase(code, id)
        else {
          const change =
            body.action === 'set_status'
              ? { case_status: body.case_status }
              : body.action === 'set_module'
                ? { module_code: body.module_code }
                : { priority_code: body.priority_code }
          const same =
            (body.action === 'set_status' && c.case_status === body.case_status) ||
            (body.action === 'set_priority' && c.priority_code === body.priority_code) ||
            (body.action === 'set_module' &&
              moduleDto(c.moduleId)?.module_code === body.module_code)
          if (same) return { code: c.case_code, outcome: 'unchanged' }
          await api.updateTestCase(code, id, change)
        }
        return { code: c.case_code, outcome: c.current_version > before ? 'updated' : 'unchanged' }
      })
    },
  }

  /** Runs items one by one without demo latency; refused items become "skipped". */
  async function runBulk(
    ids: string[],
    apply: (id: string) => Promise<{ code: string; outcome: string }>,
  ): Promise<BulkResult> {
    const result: BulkResult = { updated: 0, unchanged: 0, skipped: [] }
    bulkDepth += 1
    try {
      for (const id of [...new Set(ids)]) {
        let code = ''
        try {
          const done = await apply(id)
          code = done.code
          if (done.outcome === 'updated') result.updated += 1
          else if (done.outcome === 'unchanged') result.unchanged += 1
          else result.skipped.push({ id, code, reason: done.outcome })
        } catch (error) {
          if (!(error instanceof ApiClientError)) throw error
          const detail = error.details[0]?.message ?? ''
          result.skipped.push({
            id,
            code:
              code ||
              (db.defects.find((d) => d.id === id)?.bug_code ??
                db.cases.find((c) => c.id === id)?.case_code ??
                ''),
            reason:
              error.status === 403
                ? 'FORBIDDEN'
                : detail.startsWith('Invalid transition')
                  ? 'INVALID_TRANSITION'
                  : error.status === 409
                    ? 'ARCHIVED'
                    : error.code,
          })
        }
      }
    } finally {
      bulkDepth -= 1
    }
    return result
  }
  return api
}
