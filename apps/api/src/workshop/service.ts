import {
  countResult,
  emptyCounts,
  normalizePublicFields,
  stepsFromText,
  tableState,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionStatus,
  type ModuleRef,
  type PublicField,
  type ResultCounts,
  type RunStatus,
  type CaseSnapshot,
  type WorkshopBugDto,
  type WorkshopCaseDto,
  type WorkshopFeatureDto,
  type WorkshopFeatureState,
  type WorkshopFileRef,
  type TableMemberAccount,
  type TableMemberDto,
  type TableMember,
  type TableSessionMember,
  type WorkshopTableDto,
} from '@testboard/shared'
import type { Context } from 'hono'
import type { PoolConnection } from 'mysql2/promise'
import { randomInt } from 'node:crypto'
import { ensureProjectTask, findOrCreatePerson, maskEmail } from '../access/people.js'
import { execute, iso, parseJson, select, selectOne, type Db } from '../db/tx.js'
import type { AppEnv } from '../types.js'
import { AppError } from '../lib/errors.js'

/**
 * Queries shared by the facilitator board, the table (meja) pages and the public pages of a
 * Fase (ADR 0016). Progress always comes from the latest attempt of each scenario
 * (v_run_case_latest_status), exactly like the reports.
 */

export interface CycleRow {
  id: string
  project_id: string
  cycle_code: string
  title: string
  description: string | null
  starts_on: Date | string | null
  ends_on: Date | string | null
  status_code: string
  is_public: number
  public_fields_json: unknown
  public_intro: string | null
}

export async function loadCycle(db: Db, projectId: string, cycleId: string): Promise<CycleRow> {
  const row = await selectOne<CycleRow>(
    db,
    'SELECT * FROM test_cycles WHERE id = ? AND project_id = ?',
    [cycleId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

export function publicFieldsOf(row: Pick<CycleRow, 'public_fields_json'>): PublicField[] {
  const value = parseJson<unknown>(row.public_fields_json)
  return normalizePublicFields(Array.isArray(value) ? value.map(String) : [])
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ')

// ---- Features of a Fase -------------------------------------------------------------------

/** Modules that have scenarios in any run of the Fase, with progress and workshop state. */
export async function cycleFeatures(
  db: Db,
  cycleId: string,
  options: { includeHidden: boolean },
): Promise<WorkshopFeatureDto[]> {
  const rows = await select<{
    module_id: string
    module_code: string
    name: string
    latest_status: ExecutionStatus
    n: number
  }>(
    db,
    `SELECT m.id AS module_id, m.module_code, m.name, v.latest_status, COUNT(*) AS n
       FROM test_runs r
       JOIN v_run_case_latest_status v ON v.test_run_id = r.id
       JOIN test_cases tc ON tc.id = v.test_case_id
       JOIN modules m ON m.id = tc.module_id
      WHERE r.cycle_id = ?
      GROUP BY m.id, m.module_code, m.name, v.latest_status`,
    [cycleId],
  )
  const states = await select<{ module_id: string; state_code: WorkshopFeatureState }>(
    db,
    'SELECT module_id, state_code FROM workshop_features WHERE cycle_id = ?',
    [cycleId],
  )
  const stateOf = new Map(states.map((s) => [String(s.module_id), s.state_code]))
  const byModule = new Map<string, WorkshopFeatureDto>()
  for (const row of rows) {
    const id = String(row.module_id)
    let feature = byModule.get(id)
    if (!feature) {
      feature = {
        module: { id, module_code: row.module_code, name: row.name },
        state: stateOf.get(id) ?? 'OPEN',
        progress: emptyCounts(),
      }
      byModule.set(id, feature)
    }
    countResult(feature.progress, row.latest_status, Number(row.n))
  }
  return [...byModule.values()]
    .filter((f) => options.includeHidden || f.state !== 'HIDDEN')
    .sort((a, b) => a.module.name.localeCompare(b.module.name, 'id'))
}

/** All scenarios of the Fase (every run), latest status counted once per run case. */
export async function cycleTotals(db: Db, cycleId: string): Promise<ResultCounts> {
  const rows = await select<{ latest_status: ExecutionStatus; n: number }>(
    db,
    `SELECT v.latest_status, COUNT(*) AS n
       FROM test_runs r JOIN v_run_case_latest_status v ON v.test_run_id = r.id
      WHERE r.cycle_id = ?
      GROUP BY v.latest_status`,
    [cycleId],
  )
  const totals = emptyCounts()
  for (const row of rows) countResult(totals, row.latest_status, Number(row.n))
  return totals
}

// ---- Tables (meja) ------------------------------------------------------------------------

export interface TableRow {
  id: string
  project_id: string
  cycle_id: string
  run_id: string | null
  user_id: string
  name: string
  table_number: number | null
  member_names_json: unknown
  access_code: string
  valid_from: Date | null
  valid_until: Date
  revoked_at: Date | null
  created_at: Date
}

// ---- People at a table (migration 0014, ADR 0018) ------------------------------------------

export interface TableMemberRow {
  id: string
  table_id: string
  sort_order: number
  display_name: string
  user_id: string | null
  email: string | null
  has_password: number | null
}

export async function tableMemberRows(
  db: Db,
  tableIds: string[],
): Promise<Map<string, TableMemberRow[]>> {
  const out = new Map<string, TableMemberRow[]>()
  if (tableIds.length === 0) return out
  const rows = await select<TableMemberRow>(
    db,
    `SELECT m.id, m.table_id, m.sort_order, m.display_name, m.user_id, u.email,
            u.password_hash IS NOT NULL AS has_password
       FROM workshop_table_members m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.table_id IN (${placeholders(tableIds.length)})
      ORDER BY m.table_id, m.sort_order, m.id`,
    tableIds,
  )
  for (const row of rows) {
    const key = String(row.table_id)
    const list = out.get(key) ?? []
    list.push(row)
    out.set(key, list)
  }
  return out
}

export function memberAccount(row: TableMemberRow): TableMemberAccount {
  if (row.user_id === null) return 'NONE'
  return Number(row.has_password) === 1 ? 'ACTIVE' : 'NOT_ACTIVATED'
}

/** For Admins: with the full e-mail. */
export const adminMemberDto = (row: TableMemberRow): TableMemberDto => ({
  id: String(row.id),
  name: row.display_name,
  email: row.email,
  user_id: row.user_id === null ? null : String(row.user_id),
  account: memberAccount(row),
})

/** For the table itself: only a masked e-mail. */
export const sessionMemberDto = (row: TableMemberRow): TableSessionMember => ({
  id: String(row.id),
  name: row.display_name,
  account: memberAccount(row),
  email_hint: row.email ? maskEmail(row.email) : null,
})

/**
 * Replace a table's people (Admin). An e-mail becomes the person's User account (created
 * when new, not activated) and gives them the Penguji task in the project.
 */
export async function saveTableMembers(
  conn: PoolConnection,
  c: Context<AppEnv>,
  projectId: string,
  tableId: string,
  members: TableMember[],
): Promise<void> {
  const resolved: { name: string; userId: string | null }[] = []
  for (const member of members) {
    const name = member.name.trim()
    let userId: string | null = null
    if (member.email) {
      const person = await findOrCreatePerson(conn, c, { email: member.email, display_name: name })
      await ensureProjectTask(conn, c, projectId, person.userId)
      userId = person.userId
    }
    resolved.push({ name, userId })
  }
  await execute(conn, 'DELETE FROM workshop_table_members WHERE table_id = ?', [tableId])
  for (const [index, member] of resolved.entries()) {
    await execute(
      conn,
      `INSERT INTO workshop_table_members (table_id, sort_order, display_name, user_id)
       VALUES (?, ?, ?, ?)`,
      [tableId, index, member.name, member.userId],
    )
  }
}

/**
 * Names typed at the table itself: only people without an account change; people an Admin
 * listed with an e-mail always stay (participants never change e-mails).
 */
export async function saveTableNamesFromTable(
  conn: PoolConnection,
  tableId: string,
  names: string[],
): Promise<void> {
  const rows = (await tableMemberRows(conn, [tableId])).get(tableId) ?? []
  const kept = rows.filter((row) => row.user_id !== null)
  const taken = new Set(kept.map((row) => row.display_name.toLocaleLowerCase('id')))
  const fresh: string[] = []
  for (const name of names) {
    const key = name.trim().toLocaleLowerCase('id')
    if (!key || taken.has(key)) continue
    taken.add(key)
    fresh.push(name.trim().slice(0, 100))
  }
  await execute(conn, 'DELETE FROM workshop_table_members WHERE table_id = ? AND user_id IS NULL', [
    tableId,
  ])
  const table = await selectOne<{ run_id: string | null }>(
    conn,
    'SELECT run_id FROM workshop_tables WHERE id = ?',
    [tableId],
  )
  const start = kept.reduce((max, row) => Math.max(max, Number(row.sort_order) + 1), 0)
  for (const [index, name] of fresh.entries()) {
    await execute(
      conn,
      `INSERT INTO workshop_table_members (run_id, table_id, sort_order, display_name)
       VALUES (?, ?, ?, ?)`,
      [table?.run_id ?? null, tableId, start + index, name],
    )
  }
}

export async function tableModules(db: Db, tableIds: string[]): Promise<Map<string, ModuleRef[]>> {
  const out = new Map<string, ModuleRef[]>()
  if (tableIds.length === 0) return out
  const rows = await select<{ table_id: string; id: string; module_code: string; name: string }>(
    db,
    `SELECT wm.table_id, m.id, m.module_code, m.name
       FROM workshop_table_modules wm JOIN modules m ON m.id = wm.module_id
      WHERE wm.table_id IN (${placeholders(tableIds.length)})
      ORDER BY m.name`,
    tableIds,
  )
  for (const row of rows) {
    const list = out.get(String(row.table_id)) ?? []
    list.push({ id: String(row.id), module_code: row.module_code, name: row.name })
    out.set(String(row.table_id), list)
  }
  return out
}

/** Progress of each table: scenarios of its run whose module is assigned to the table. */
export async function tableProgress(
  db: Db,
  tableIds: string[],
): Promise<Map<string, ResultCounts>> {
  const out = new Map<string, ResultCounts>(tableIds.map((id) => [id, emptyCounts()]))
  if (tableIds.length === 0) return out
  const rows = await select<{ table_id: string; latest_status: ExecutionStatus; n: number }>(
    db,
    `SELECT t.id AS table_id, v.latest_status, COUNT(*) AS n
       FROM workshop_tables t
       JOIN workshop_table_modules wm ON wm.table_id = t.id
       JOIN test_run_cases trc ON trc.test_run_id = t.run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id AND tc.module_id = wm.module_id
       JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
      WHERE t.id IN (${placeholders(tableIds.length)})
      GROUP BY t.id, v.latest_status`,
    tableIds,
  )
  for (const row of rows) {
    countResult(out.get(String(row.table_id)) ?? emptyCounts(), row.latest_status, Number(row.n))
  }
  return out
}

/** Problems reported by each table account, last activity and signed-in devices. */
export async function tableActivity(db: Db, tables: { id: string; user_id: string }[]) {
  const bugs = new Map<string, number>()
  const last = new Map<string, string | null>()
  const devices = new Map<string, number>()
  if (tables.length === 0) return { bugs, last, devices }
  const userIds = tables.map((t) => String(t.user_id))
  const byUser = new Map(tables.map((t) => [String(t.user_id), String(t.id)]))
  const [bugRows, execRows, deviceRows] = await Promise.all([
    select<{ user_id: string; n: number; last_at: Date | null }>(
      db,
      `SELECT reported_by AS user_id, COUNT(*) AS n, MAX(created_at) AS last_at FROM defects
        WHERE reported_by IN (${placeholders(userIds.length)}) GROUP BY reported_by`,
      userIds,
    ),
    select<{ user_id: string; last_at: Date | null }>(
      db,
      `SELECT tester_id AS user_id, MAX(tested_at) AS last_at FROM test_executions
        WHERE tester_id IN (${placeholders(userIds.length)}) GROUP BY tester_id`,
      userIds,
    ),
    select<{ user_id: string; n: number }>(
      db,
      `SELECT user_id, COUNT(*) AS n FROM user_sessions
        WHERE user_id IN (${placeholders(userIds.length)}) AND revoked_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)
        GROUP BY user_id`,
      userIds,
    ),
  ])
  const later = (a: string | null | undefined, b: string | null) =>
    !a ? b : !b ? a : a > b ? a : b
  for (const row of bugRows) {
    const id = byUser.get(String(row.user_id)) ?? ''
    bugs.set(id, Number(row.n))
    last.set(id, later(last.get(id), iso(row.last_at)))
  }
  for (const row of execRows) {
    const id = byUser.get(String(row.user_id)) ?? ''
    last.set(id, later(last.get(id), iso(row.last_at)))
  }
  for (const row of deviceRows) devices.set(byUser.get(String(row.user_id)) ?? '', Number(row.n))
  return { bugs, last, devices }
}

/** The groups (meja) of a UAT, or of every UAT of a Fase (public page of an older link). */
export async function listTables(
  db: Db,
  projectId: string,
  scope: { runId?: string; cycleId?: string },
  tableId?: string,
): Promise<WorkshopTableDto[]> {
  const rows = await select<
    TableRow & {
      cycle_code: string
      cycle_title: string
      run_code: string | null
      run_name: string | null
      run_status: RunStatus | null
    }
  >(
    db,
    `SELECT t.*, c.cycle_code, c.title AS cycle_title,
            r.run_code, r.name AS run_name, r.status_code AS run_status
       FROM workshop_tables t
       JOIN test_cycles c ON c.id = t.cycle_id
       LEFT JOIN test_runs r ON r.id = t.run_id
      WHERE t.project_id = ? AND (? IS NULL OR t.run_id = ?) AND (? IS NULL OR t.cycle_id = ?)
        AND (? IS NULL OR t.id = ?)
      ORDER BY t.table_number IS NULL, t.table_number, LENGTH(t.name), t.name`,
    [
      projectId,
      scope.runId ?? null,
      scope.runId ?? null,
      scope.cycleId ?? null,
      scope.cycleId ?? null,
      tableId ?? null,
      tableId ?? null,
    ],
  )
  const ids = rows.map((r) => String(r.id))
  const [modules, progress, activity, members] = await Promise.all([
    tableModules(db, ids),
    tableProgress(db, ids),
    tableActivity(db, rows),
    tableMemberRows(db, ids),
  ])
  return rows.map((row) => {
    const id = String(row.id)
    const dates = {
      valid_from: iso(row.valid_from),
      valid_until: iso(row.valid_until) ?? '',
      revoked_at: iso(row.revoked_at),
    }
    return {
      id,
      name: row.name,
      table_number: row.table_number === null ? null : Number(row.table_number),
      cycle: { id: String(row.cycle_id), cycle_code: row.cycle_code, title: row.cycle_title },
      run: row.run_id
        ? {
            id: String(row.run_id),
            run_code: row.run_code ?? '',
            name: row.run_name ?? '',
            status_code: row.run_status ?? 'PLANNED',
          }
        : null,
      modules: modules.get(id) ?? [],
      member_names: (members.get(id) ?? []).map((m) => m.display_name),
      members: (members.get(id) ?? []).map(adminMemberDto),
      access_code: row.access_code,
      ...dates,
      state: tableState(dates),
      progress: progress.get(id) ?? emptyCounts(),
      open_bugs: activity.bugs.get(id) ?? 0,
      last_activity_at: activity.last.get(id) ?? null,
      devices: activity.devices.get(id) ?? 0,
    }
  })
}

/** Unique 6-digit card code (the unique key settles a race between two creations). */
export async function freeAccessCode(db: Db): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = String(randomInt(100000, 1000000))
    const taken = await selectOne(db, 'SELECT 1 FROM workshop_tables WHERE access_code = ?', [code])
    if (!taken) return code
  }
  throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Could not find a free table code.')
}

// ---- Problems (bugs) of a Fase ------------------------------------------------------------

interface BugRow {
  id: string
  bug_code: string
  title: string
  description: string | null
  actual_behavior: string | null
  module_id: string | null
  module_code: string | null
  module_name: string | null
  status_code: DefectStatus
  severity_code: DefectSeverity
  priority_code: string
  created_at: Date
  reported_at: Date | null
  reported_by: string | null
  reporter_name: string | null
  reporter_kind: string | null
  table_name: string | null
  legacy_reporter_name: string | null
  duplicate_of_id: string | null
  duplicate_code: string | null
  reviewed_at: Date | null
  confirmations: number
  duplicates: number
}

export const BUG_SELECT = `
  SELECT d.id, d.bug_code, d.title, d.description, d.actual_behavior, d.module_id,
         m.module_code, m.name AS module_name, d.status_code, d.severity_code, d.priority_code,
         d.created_at, d.reported_at, d.reported_by, u.display_name AS reporter_name,
         u.auth_provider AS reporter_kind, wt.name AS table_name, d.legacy_reporter_name,
         d.duplicate_of_id, dup.bug_code AS duplicate_code, d.reviewed_at,
         (SELECT COUNT(*) FROM defect_confirmations dc WHERE dc.defect_id = d.id) AS confirmations,
         (SELECT COUNT(*) FROM defects dd WHERE dd.duplicate_of_id = d.id) AS duplicates
    FROM defects d
    LEFT JOIN modules m ON m.id = d.module_id
    LEFT JOIN users u ON u.id = d.reported_by
    LEFT JOIN workshop_tables wt ON wt.user_id = d.reported_by
    LEFT JOIN defects dup ON dup.id = d.duplicate_of_id`

export type { BugRow }

export async function cycleBugRows(
  db: Db,
  projectId: string,
  cycleId: string,
  options: { includeDuplicates?: boolean; ids?: string[] } = {},
): Promise<BugRow[]> {
  const ids = options.ids ?? []
  return select<BugRow>(
    db,
    `${BUG_SELECT}
      WHERE d.project_id = ? AND d.cycle_id = ?
        ${options.includeDuplicates ? '' : 'AND d.duplicate_of_id IS NULL'}
        ${ids.length ? `AND d.id IN (${placeholders(ids.length)})` : ''}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT 2000`,
    [projectId, cycleId, ...ids],
  )
}

export async function defectFileRefs(
  db: Db,
  defectIds: string[],
): Promise<Map<string, WorkshopFileRef[]>> {
  const out = new Map<string, WorkshopFileRef[]>()
  if (defectIds.length === 0) return out
  const rows = await select<{
    defect_id: string
    id: string
    original_filename: string
    processing_status: string
    scan_status: string
  }>(
    db,
    `SELECT df.defect_id, f.id, f.original_filename, f.processing_status, f.scan_status
       FROM defect_files df JOIN file_objects f ON f.id = df.file_object_id
      WHERE df.defect_id IN (${placeholders(defectIds.length)}) AND f.deleted_at IS NULL
      ORDER BY df.sort_order, f.id`,
    defectIds,
  )
  for (const row of rows) {
    const list = out.get(String(row.defect_id)) ?? []
    list.push({
      id: String(row.id),
      original_filename: row.original_filename,
      ready: row.processing_status === 'READY' && row.scan_status === 'CLEAN',
    })
    out.set(String(row.defect_id), list)
  }
  return out
}

/** "Meja 3 · Bu Sri", or the reporter's own name, or the name from an imported file. */
export function reporterLabel(row: BugRow, testerName: string | null): string | null {
  if (row.table_name) return [row.table_name, testerName].filter(Boolean).join(' · ')
  return row.reporter_name ?? row.legacy_reporter_name ?? null
}

export async function toWorkshopBugs(
  db: Db,
  rows: BugRow[],
  viewerUserId: string | null,
): Promise<WorkshopBugDto[]> {
  const ids = rows.map((r) => String(r.id))
  const [files, mine] = await Promise.all([
    defectFileRefs(db, ids),
    viewerUserId && ids.length
      ? select<{ defect_id: string }>(
          db,
          `SELECT defect_id FROM defect_confirmations
            WHERE user_id = ? AND defect_id IN (${placeholders(ids.length)})`,
          [viewerUserId, ...ids],
        )
      : Promise.resolve([]),
  ])
  const confirmed = new Set(mine.map((m) => String(m.defect_id)))
  return rows.map((row) => ({
    id: String(row.id),
    bug_code: row.bug_code,
    title: row.title,
    description: row.actual_behavior ?? row.description,
    module: row.module_id
      ? {
          id: String(row.module_id),
          module_code: row.module_code ?? '',
          name: row.module_name ?? '',
        }
      : null,
    status_code: row.status_code,
    severity_code: row.severity_code,
    reported_at: iso(row.reported_at ?? row.created_at) ?? '',
    table_name: row.table_name,
    tester_name: row.table_name ? row.legacy_reporter_name : null,
    confirmations: Number(row.confirmations) + Number(row.duplicates),
    confirmed_by_me:
      confirmed.has(String(row.id)) ||
      (viewerUserId !== null && String(row.reported_by) === viewerUserId),
    duplicate_of: row.duplicate_of_id
      ? { id: String(row.duplicate_of_id), bug_code: row.duplicate_code ?? '' }
      : null,
    files: files.get(String(row.id)) ?? [],
  }))
}

// ---- Scenarios ----------------------------------------------------------------------------

/** Scenario as frozen in the run (falls back to the live case for older rows). */
export function caseView(row: {
  case_snapshot_json: unknown
  case_code: string
  title: string
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  expected_result: string | null
}) {
  const snap = parseJson<Partial<CaseSnapshot>>(row.case_snapshot_json) ?? {}
  const stepsText = snap.test_steps_text ?? row.test_steps_text
  const steps = snap.steps?.length
    ? snap.steps.map((s) => s.instruction)
    : stepsFromText(stepsText).map((s) => s.instruction)
  return {
    case_code: snap.case_code ?? row.case_code,
    title: snap.title ?? row.title,
    actor_label: snap.actor_label ?? row.actor_label,
    preconditions: snap.preconditions ?? row.preconditions,
    steps,
    expected_result: snap.expected_result ?? row.expected_result,
  }
}

/** Scenarios of one feature in a run, with the latest answer and the problems found. */
export async function featureCases(
  db: Db,
  runId: string,
  moduleId: string,
  viewerUserId: string | null,
): Promise<WorkshopCaseDto[]> {
  const rows = await select<{
    run_case_id: string
    case_snapshot_json: unknown
    case_code: string
    title: string
    actor_label: string | null
    preconditions: string | null
    test_steps_text: string | null
    expected_result: string | null
    latest_status: ExecutionStatus
    tester_id: string | null
    legacy_tester_name: string | null
    tester_table: string | null
    tester_display: string | null
    actual_result: string | null
    notes: string | null
    tested_at: Date | null
  }>(
    db,
    `SELECT trc.id AS run_case_id, trc.case_snapshot_json, tc.case_code, tc.title,
            tc.actor_label, tc.preconditions, tc.test_steps_text, tc.expected_result,
            v.latest_status, e.tester_id, e.legacy_tester_name, wt.name AS tester_table,
            u.display_name AS tester_display, e.actual_result, e.notes, e.tested_at
       FROM test_run_cases trc
       JOIN test_cases tc ON tc.id = trc.test_case_id
       JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
       LEFT JOIN test_executions e ON e.id = v.last_execution_id
       LEFT JOIN workshop_tables wt ON wt.user_id = e.tester_id
       LEFT JOIN users u ON u.id = e.tester_id
      WHERE trc.test_run_id = ? AND tc.module_id = ?
      ORDER BY trc.sort_order, trc.id`,
    [runId, moduleId],
  )
  const ids = rows.map((r) => String(r.run_case_id))
  const bugRows = ids.length
    ? await select<{
        run_case_id: string
        id: string
        bug_code: string
        title: string
        status_code: DefectStatus
      }>(
        db,
        `SELECT DISTINCT e.run_case_id, d.id, d.bug_code, d.title, d.status_code
           FROM defect_execution_links l
           JOIN test_executions e ON e.id = l.execution_id
           JOIN defects d ON d.id = l.defect_id
          WHERE e.run_case_id IN (${ids.map(() => '?').join(', ')})
            AND d.duplicate_of_id IS NULL
          ORDER BY d.bug_code`,
        ids,
      )
    : []
  const cases: WorkshopCaseDto[] = rows.map((row) => {
    const answered = row.latest_status !== 'NOT_RUN'
    return {
      run_case_id: String(row.run_case_id),
      ...caseView(row),
      latest: answered
        ? {
            status: row.latest_status,
            table_name: row.tester_table ?? row.tester_display,
            tester_name: row.legacy_tester_name,
            note: row.actual_result ?? row.notes,
            at: iso(row.tested_at),
            mine: viewerUserId !== null && String(row.tester_id) === viewerUserId,
          }
        : null,
      bugs: bugRows
        .filter((b) => String(b.run_case_id) === String(row.run_case_id))
        .map((b) => ({
          id: String(b.id),
          bug_code: b.bug_code,
          title: b.title,
          status_code: b.status_code,
        })),
    }
  })
  return cases
}
