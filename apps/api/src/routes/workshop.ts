import {
  countResult,
  defectCreateSchema,
  emptyCounts,
  executionCreateSchema,
  tableState,
  textCloseness,
  workshopBugSchema,
  workshopConfirmSchema,
  workshopActivateSchema,
  workshopJoinAsMemberSchema,
  workshopJoinSchema,
  workshopMembersSchema,
  workshopResultSchema,
  type ExecutionStatus,
  type ModuleRef,
  type RunStatus,
  type WorkshopFeatureDto,
  type WorkshopResultSaved,
  type WorkshopSessionDto,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { requireAuth } from '../auth/middleware.js'
import { hashPassword } from '../auth/passwords.js'
import { clientIp, createSession, revokeSession } from '../auth/sessions.js'
import type { AppConfig } from '../config/env.js'
import { execute, iso, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import { linkFiles, assertAttachable } from '../files/attach.js'
import type { FileService } from '../files/pipeline.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { IdempotencyStore } from '../lib/idempotency.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { SettingsService } from '../settings/service.js'
import type { AppEnv } from '../types.js'
import {
  cycleBugRows,
  caseView,
  featureCases,
  saveTableNamesFromTable,
  sessionMemberDto,
  tableMemberRows,
  tableModules,
  toWorkshopBugs,
  type TableRow,
} from '../workshop/service.js'
import { insertDefect } from './defects-write.js'
import { serveFile, uploadEvidence } from './files.js'
import { recordExecution } from './run-cases.js'

/** Wrong card codes allowed per address in 15 minutes (a venue shares one address). */
export const JOIN_WINDOW_MINUTES = 15
export const MAX_JOIN_FAILURES_PER_IP = 60
/** Marker row in auth_login_attempts so card codes never lock out the e-mail login. */
export const JOIN_ATTEMPT_MARKER = 'workshop-join'

interface TableContext {
  table: TableRow
  project: { id: string; code: string; name: string }
  cycle: { id: string; cycle_code: string; title: string }
  run: { id: string; name: string; status_code: RunStatus } | null
  moduleIds: Set<string>
  modules: ModuleRef[]
}

/** The table (meja) behind the current card session; closed cards sign the device out. */
async function tableContext(db: Db, c: Context<AppEnv>): Promise<TableContext> {
  const auth = requireAuth(c)
  if (auth.accountKind !== 'TABLE') throw new AppError(404, 'NOT_FOUND', 'Not found.')
  const row = await selectOne<
    TableRow & {
      project_code: string
      project_name: string
      is_archived: number
      cycle_code: string
      cycle_title: string
      run_name: string | null
      run_status: RunStatus | null
    }
  >(
    db,
    `SELECT t.*, p.project_code, p.name AS project_name, p.is_archived,
            c.cycle_code, c.title AS cycle_title, r.name AS run_name, r.status_code AS run_status
       FROM workshop_tables t
       JOIN projects p ON p.id = t.project_id
       JOIN test_cycles c ON c.id = t.cycle_id
       LEFT JOIN test_runs r ON r.id = t.run_id
      WHERE t.user_id = ?`,
    [auth.userId],
  )
  const state = row
    ? tableState({
        valid_from: iso(row.valid_from),
        valid_until: iso(row.valid_until) ?? '',
        revoked_at: iso(row.revoked_at),
      })
    : 'REVOKED'
  if (!row || state !== 'ACTIVE' || Number(row.is_archived) === 1) {
    throw new AppError(401, 'UNAUTHENTICATED', 'This table card is no longer valid.', [
      { field: 'table', message: row && Number(row.is_archived) !== 1 ? state : 'REVOKED' },
    ])
  }
  const modules = (await tableModules(db, [String(row.id)])).get(String(row.id)) ?? []
  return {
    table: row,
    project: { id: String(row.project_id), code: row.project_code, name: row.project_name },
    cycle: { id: String(row.cycle_id), cycle_code: row.cycle_code, title: row.cycle_title },
    run: row.run_id
      ? {
          id: String(row.run_id),
          name: row.run_name ?? '',
          status_code: row.run_status ?? 'PLANNED',
        }
      : null,
    moduleIds: new Set(modules.map((m) => m.id)),
    modules,
  }
}

async function featureProgress(db: Db, ctx: TableContext): Promise<WorkshopFeatureDto[]> {
  const counts = new Map(ctx.modules.map((m) => [m.id, emptyCounts()]))
  if (ctx.run && ctx.modules.length) {
    const rows = await select<{ module_id: string; latest_status: ExecutionStatus; n: number }>(
      db,
      `SELECT tc.module_id, v.latest_status, COUNT(*) AS n
         FROM test_run_cases trc
         JOIN test_cases tc ON tc.id = trc.test_case_id
         JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
        WHERE trc.test_run_id = ? AND tc.module_id IN (${ctx.modules.map(() => '?').join(', ')})
        GROUP BY tc.module_id, v.latest_status`,
      [ctx.run.id, ...ctx.modules.map((m) => m.id)],
    )
    for (const row of rows) {
      const counted = counts.get(String(row.module_id))
      if (counted) countResult(counted, row.latest_status, Number(row.n))
    }
  }
  return ctx.modules.map((module) => ({
    module,
    state: 'OPEN',
    progress: counts.get(module.id) ?? emptyCounts(),
  }))
}

async function sessionDto(db: Db, ctx: TableContext): Promise<WorkshopSessionDto> {
  const tableId = String(ctx.table.id)
  const members = (await tableMemberRows(db, [tableId])).get(tableId) ?? []
  return {
    table: {
      id: tableId,
      name: ctx.table.name,
      member_names: members.map((m) => m.display_name),
      members: members.map(sessionMemberDto),
    },
    project: { code: ctx.project.code, name: ctx.project.name },
    cycle: ctx.cycle,
    run: ctx.run,
    features: await featureProgress(db, ctx),
    valid_until: iso(ctx.table.valid_until) ?? '',
  }
}

async function scenarioRow(db: Db, ctx: TableContext, runCaseId: string) {
  if (!ctx.run) throw new AppError(409, 'CONFLICT', 'This table has no test run yet.')
  const row = await selectOne<{
    run_case_id: string
    module_id: string | null
    case_snapshot_json: unknown
    case_code: string
    title: string
    actor_label: string | null
    preconditions: string | null
    test_steps_text: string | null
    expected_result: string | null
  }>(
    db,
    `SELECT trc.id AS run_case_id, tc.module_id, trc.case_snapshot_json, tc.case_code, tc.title,
            tc.actor_label, tc.preconditions, tc.test_steps_text, tc.expected_result
       FROM test_run_cases trc JOIN test_cases tc ON tc.id = trc.test_case_id
      WHERE trc.id = ? AND trc.test_run_id = ?`,
    [runCaseId, ctx.run.id],
  )
  if (!row || !row.module_id || !ctx.moduleIds.has(String(row.module_id))) {
    throw new AppError(404, 'NOT_FOUND', 'Not found.')
  }
  return row
}

async function assertCycleDefect(db: Db, ctx: TableContext, defectId: string) {
  const row = await selectOne<{ id: string; duplicate_of_id: string | null }>(
    db,
    'SELECT id, duplicate_of_id FROM defects WHERE id = ? AND project_id = ? AND cycle_id = ?',
    [defectId, ctx.project.id, ctx.cycle.id],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  // A "+1" on a bug that was merged goes to the bug it was merged into.
  return row.duplicate_of_id ? String(row.duplicate_of_id) : String(row.id)
}

async function confirmDefect(
  conn: PoolConnection,
  c: Context<AppEnv>,
  ctx: TableContext,
  defectId: string,
  input: { note?: string | null; tester_name?: string | null; evidence?: { file_id: string }[] },
) {
  await execute(
    conn,
    `INSERT INTO defect_confirmations (defect_id, user_id, tester_name, note) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE tester_name = VALUES(tester_name),
                             note = COALESCE(VALUES(note), note)`,
    [defectId, ctx.table.user_id, input.tester_name ?? null, input.note ?? null],
  )
  if (input.evidence?.length) {
    await assertAttachable(conn, ctx.project.id, input.evidence)
    await linkFiles(conn, 'defect', defectId, input.evidence)
  }
  await writeAudit(conn, c, {
    projectId: ctx.project.id,
    entityType: 'defect',
    entityId: defectId,
    action: 'CONFIRM',
    newValues: {
      table: ctx.table.name,
      tester_name: input.tester_name ?? null,
      note: input.note ?? null,
      evidence_file_ids: (input.evidence ?? []).map((e) => e.file_id),
    },
  })
}

/** Title for a problem reported from a scenario: what was being tried. */
const scenarioTitle = (code: string, title: string) => `${code} - ${title}`.slice(0, 500)

export function workshopRoutes(
  pool: Pool,
  config: AppConfig,
  settings: SettingsService,
  files: FileService,
) {
  const routes = new Hono<AppEnv>()
  const idempotency = new IdempotencyStore()

  // ---- Sign in with a table card (QR or 6-digit code) ------------------------------------
  routes.post('/join', async (c) => {
    const input = await parseBody(c, workshopJoinSchema)
    const ip = clientIp(c)
    const failures = await selectOne<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM auth_login_attempts
        WHERE email_hash = SHA2(?, 256) AND succeeded = 0 AND ? IS NOT NULL AND ip_address = ?
          AND attempted_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE`,
      [JOIN_ATTEMPT_MARKER, ip, ip, JOIN_WINDOW_MINUTES],
    )
    if (Number(failures?.n ?? 0) >= MAX_JOIN_FAILURES_PER_IP) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many wrong codes. Try again later.')
    }
    const table = await selectOne<TableRow & { is_archived: number }>(
      pool,
      `SELECT t.*, p.is_archived FROM workshop_tables t JOIN projects p ON p.id = t.project_id
        WHERE t.access_code = ?`,
      [input.code],
    )
    if (!table) {
      await execute(
        pool,
        'INSERT INTO auth_login_attempts (email_hash, ip_address, succeeded) VALUES (SHA2(?, 256), ?, 0)',
        [JOIN_ATTEMPT_MARKER, ip],
      )
      throw new AppError(401, 'UNAUTHENTICATED', 'Unknown table code.', [
        { field: 'code', message: 'WRONG_CODE' },
      ])
    }
    const state =
      Number(table.is_archived) === 1
        ? 'REVOKED'
        : tableState({
            valid_from: iso(table.valid_from),
            valid_until: iso(table.valid_until) ?? '',
            revoked_at: iso(table.revoked_at),
          })
    if (state !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHENTICATED', 'This table card is not valid now.', [
        { field: 'code', message: state },
      ])
    }
    return c.json(await openTableSession(c, table))
  })

  /** Sign this device in as the table (card code, or a listed member from "Tugas saya"). */
  async function openTableSession(
    c: Context<AppEnv>,
    table: TableRow,
    extra?: { memberName: string },
  ): Promise<WorkshopSessionDto> {
    const sessionConfig = await settings.sessionConfig(config)
    const previous = c.get('auth')
    await withTransaction(pool, async (conn) => {
      // A person's own session on this device ends: the device now belongs to the table.
      if (previous?.sessionId) await revokeSession(conn, previous.sessionId)
      await createSession(conn, c, sessionConfig, String(table.user_id), {
        expiresAt: table.valid_until,
      })
      await writeAudit(conn, c, {
        projectId: String(table.project_id),
        entityType: 'workshop_table',
        entityId: String(table.id),
        action: 'LOGIN',
        ...(extra ? { newValues: { member: extra.memberName } } : {}),
      })
    })
    // The new cookie is not on this request yet: build the answer from the table itself.
    c.set('auth', {
      userId: String(table.user_id),
      email: '',
      displayName: table.name,
      preferredLocale: 'id',
      isSuperAdmin: false,
      isAdmin: false,
      sessionId: '',
      csrfTokenHash: '',
      accountKind: 'TABLE',
    })
    return sessionDto(pool, await tableContext(pool, c))
  }

  // ---- A User opens their own table from "Tugas saya" (no card code needed) --------------
  routes.post('/join-member', async (c) => {
    const auth = requireAuth(c)
    if (auth.accountKind !== 'PERSON') throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const input = await parseBody(c, workshopJoinAsMemberSchema)
    const table = await selectOne<TableRow & { is_archived: number; member_name: string }>(
      pool,
      `SELECT t.*, p.is_archived, m.display_name AS member_name
         FROM workshop_table_members m
         JOIN workshop_tables t ON t.id = m.table_id
         JOIN projects p ON p.id = t.project_id
        WHERE m.table_id = ? AND m.user_id = ?`,
      [input.table_id, auth.userId],
    )
    if (!table) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const state =
      Number(table.is_archived) === 1
        ? 'REVOKED'
        : tableState({
            valid_from: iso(table.valid_from),
            valid_until: iso(table.valid_until) ?? '',
            revoked_at: iso(table.revoked_at),
          })
    if (state !== 'ACTIVE') {
      throw new AppError(409, 'CONFLICT', 'This table card is not valid now.', [
        { field: 'table', message: state },
      ])
    }
    const session = await openTableSession(c, table, { memberName: table.member_name })
    return c.json({ session, member_name: table.member_name })
  })

  routes.get('/session', async (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(await sessionDto(pool, await tableContext(pool, c)))
  })

  routes.put('/members', async (c) => {
    const ctx = await tableContext(pool, c)
    const input = await parseBody(c, workshopMembersSchema)
    const tableId = String(ctx.table.id)
    await withTransaction(pool, async (conn) => {
      const before = (await tableMemberRows(conn, [tableId])).get(tableId) ?? []
      await saveTableNamesFromTable(conn, tableId, input.member_names)
      const after = (await tableMemberRows(conn, [tableId])).get(tableId) ?? []
      await writeAudit(conn, c, {
        projectId: ctx.project.id,
        entityType: 'workshop_table',
        entityId: tableId,
        action: 'UPDATE',
        oldValues: { member_names: before.map((m) => m.display_name) },
        newValues: { member_names: after.map((m) => m.display_name) },
      })
    })
    return c.json(await sessionDto(pool, await tableContext(pool, c)))
  })

  // ---- "Aktifkan akun saya": a listed member chooses a password at their table -----------
  routes.post('/members/:memberId/activate', async (c) => {
    const ctx = await tableContext(pool, c)
    const memberId = idParam(c, 'memberId')
    const input = await parseBody(c, workshopActivateSchema)
    const member = await selectOne<{ user_id: string | null; email: string | null }>(
      pool,
      `SELECT m.user_id, u.email FROM workshop_table_members m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.id = ? AND m.table_id = ?`,
      [memberId, ctx.table.id],
    )
    if (!member?.user_id || !member.email) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    if (input.password.toLowerCase().includes(member.email.split('@')[0] ?? '\u0000')) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'password', message: 'Password must not contain your e-mail name' },
      ])
    }
    const passwordHash = await hashPassword(input.password)
    await withTransaction(pool, async (conn) => {
      // Only once, and only for an account that never had a password (an Admin's link or the
      // "Lupa kata sandi" request handles everything else).
      const result = await execute(
        conn,
        `UPDATE users SET password_hash = ?
          WHERE id = ? AND password_hash IS NULL AND auth_provider = 'LOCAL' AND is_active = 1`,
        [passwordHash, member.user_id],
      )
      if (result.affectedRows !== 1) {
        throw new AppError(409, 'CONFLICT', 'This account is already active.', [
          { field: 'member', message: 'ALREADY_ACTIVE' },
        ])
      }
      await writeAudit(conn, c, {
        projectId: ctx.project.id,
        entityType: 'user',
        entityId: String(member.user_id),
        action: 'ACTIVATE',
        newValues: { via: 'table', table: ctx.table.name },
      })
    })
    return c.json(await sessionDto(pool, await tableContext(pool, c)))
  })

  // ---- Scenarios of one feature ----------------------------------------------------------
  routes.get('/features/:moduleId/cases', async (c) => {
    const ctx = await tableContext(pool, c)
    const moduleId = idParam(c, 'moduleId')
    if (!ctx.moduleIds.has(moduleId)) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    if (!ctx.run) return c.json([])
    return c.json(await featureCases(pool, ctx.run.id, moduleId, String(ctx.table.user_id)))
  })

  // ---- Answer a scenario: Sesuai / Tidak sesuai / Tidak bisa dicoba ---------------------
  routes.post('/cases/:runCaseId/result', async (c) => {
    const ctx = await tableContext(pool, c)
    const runCaseId = idParam(c, 'runCaseId')
    const input = await parseBody(c, workshopResultSchema)
    const key = input.client_id ? `ws-result:${ctx.table.user_id}:${input.client_id}` : null
    const replay = key ? idempotency.get(key) : null
    if (replay) return c.json(replay.body as WorkshopResultSaved, 201)
    if (ctx.run?.status_code !== 'ACTIVE') {
      throw new AppError(409, 'CONFLICT', 'The test run is not open.', [
        { field: 'run', message: 'RUN_NOT_ACTIVE' },
      ])
    }
    const scenario = await scenarioRow(pool, ctx, runCaseId)
    const view = caseView(scenario)
    const sameAs = input.same_as_defect_id
      ? await assertCycleDefect(pool, ctx, input.same_as_defect_id)
      : null
    const sameCode = sameAs
      ? ((
          await selectOne<{ bug_code: string }>(pool, 'SELECT bug_code FROM defects WHERE id = ?', [
            sameAs,
          ])
        )?.bug_code ?? '')
      : ''
    const evidence = input.evidence ?? []

    const saved = await withTransaction(pool, async (conn) => {
      const executionInput = executionCreateSchema.parse({
        result_status: input.result_status,
        actual_result:
          input.result_status === 'FAILED' ? (input.note ?? `Sama dengan ${sameCode}`) : null,
        notes:
          input.result_status === 'BLOCKED'
            ? (input.note ?? 'Tidak bisa dicoba')
            : input.result_status === 'PASSED'
              ? input.note
              : null,
        evidence,
        browser_name: null,
      })
      const executionId = await recordExecution(conn, c, ctx.project, runCaseId, executionInput, {
        userId: String(ctx.table.user_id),
        anyCase: true,
        testerName: input.tester_name ?? null,
      })
      let defect: WorkshopResultSaved['defect'] = null
      if (input.result_status === 'FAILED') {
        if (sameAs) {
          await confirmDefect(conn, c, ctx, sameAs, {
            note: input.note ?? null,
            tester_name: input.tester_name ?? null,
            evidence,
          })
          await execute(
            conn,
            'INSERT IGNORE INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
            [sameAs, executionId],
          )
          defect = { id: sameAs, bug_code: sameCode, created: false }
        } else {
          const body = defectCreateSchema.parse({
            title: scenarioTitle(view.case_code, view.title),
            actual_behavior: input.note,
            expected_behavior: view.expected_result,
            steps_to_reproduce: view.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') || null,
            module_id: scenario.module_id ? String(scenario.module_id) : null,
            cycle_id: ctx.cycle.id,
            execution_ids: [executionId],
            evidence,
          })
          const id = await insertDefect(conn, c, ctx.project, String(ctx.table.user_id), body, {
            reporterName: input.tester_name ?? null,
          })
          const code = await selectOne<{ bug_code: string }>(
            conn,
            'SELECT bug_code FROM defects WHERE id = ?',
            [id],
          )
          defect = { id, bug_code: code?.bug_code ?? '', created: true }
        }
      }
      return { execution_id: executionId, defect }
    })
    if (key) idempotency.set(key, 201, saved)
    return c.json(saved, 201)
  })

  // ---- Problems of the Fase: list, search for "sama?", report, +1 -----------------------
  routes.get('/bugs', async (c) => {
    c.header('Cache-Control', 'no-store')
    const ctx = await tableContext(pool, c)
    const moduleId = c.req.query('module') || null
    const query = (c.req.query('q') ?? '').trim().slice(0, 2000)
    const runCaseId = c.req.query('run_case') || null
    let rows = await cycleBugRows(pool, ctx.project.id, ctx.cycle.id)
    if (moduleId) rows = rows.filter((r) => String(r.module_id) === moduleId)
    if (!query)
      return c.json(await toWorkshopBugs(pool, rows.slice(0, 500), String(ctx.table.user_id)))

    const sameScenario = new Set<string>()
    if (runCaseId) {
      const linked = await select<{ defect_id: string }>(
        pool,
        `SELECT DISTINCT l.defect_id FROM defect_execution_links l
           JOIN test_executions e ON e.id = l.execution_id WHERE e.run_case_id = ?`,
        [runCaseId],
      )
      for (const l of linked) sameScenario.add(String(l.defect_id))
    }
    const scored = rows
      .map((row) => ({
        row,
        score: Math.min(
          1,
          textCloseness(query, `${row.title} ${row.actual_behavior ?? row.description ?? ''}`) +
            (sameScenario.has(String(row.id)) ? 0.35 : 0),
        ),
      }))
      .filter((s) => s.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    const bugs = await toWorkshopBugs(
      pool,
      scored.map((s) => s.row),
      String(ctx.table.user_id),
    )
    return c.json(
      bugs.map((bug, i) => ({ ...bug, score: Math.round((scored[i]?.score ?? 0) * 100) / 100 })),
    )
  })

  routes.post('/bugs', async (c) => {
    const ctx = await tableContext(pool, c)
    const input = await parseBody(c, workshopBugSchema)
    const key = input.client_id ? `ws-bug:${ctx.table.user_id}:${input.client_id}` : null
    const replay = key ? idempotency.get(key) : null
    if (replay) return c.json(replay.body as object, 201)
    if (input.module_id && !ctx.moduleIds.has(input.module_id)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'module_id', message: 'Not a feature of this table' },
      ])
    }
    const firstLine = input.note.split('\n')[0]?.trim() ?? ''
    const created = await withTransaction(pool, async (conn) => {
      const body = defectCreateSchema.parse({
        title:
          (input.title ?? (firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine)) ||
          'Masalah',
        actual_behavior: input.note,
        module_id: input.module_id,
        cycle_id: ctx.cycle.id,
        evidence: input.evidence ?? [],
      })
      const id = await insertDefect(conn, c, ctx.project, String(ctx.table.user_id), body, {
        reporterName: input.tester_name ?? null,
      })
      const row = await selectOne<{ bug_code: string }>(
        conn,
        'SELECT bug_code FROM defects WHERE id = ?',
        [id],
      )
      return { id, bug_code: row?.bug_code ?? '', created: true }
    })
    if (key) idempotency.set(key, 201, created)
    return c.json(created, 201)
  })

  routes.post('/bugs/:defectId/confirm', async (c) => {
    const ctx = await tableContext(pool, c)
    const target = await assertCycleDefect(pool, ctx, idParam(c, 'defectId'))
    const input = await parseBody(c, workshopConfirmSchema)
    await withTransaction(pool, (conn) => confirmDefect(conn, c, ctx, target, input))
    const rows = await cycleBugRows(pool, ctx.project.id, ctx.cycle.id, { ids: [target] })
    const [bug] = await toWorkshopBugs(pool, rows, String(ctx.table.user_id))
    return c.json(bug)
  })

  // ---- Photos / screenshots -------------------------------------------------------------
  routes.post('/files', async (c) => {
    const ctx = await tableContext(pool, c)
    return c.json(
      await uploadEvidence(c, pool, files, ctx.project.id, String(ctx.table.user_id)),
      202,
    )
  })

  routes.get('/files/:fileId/status', async (c) => {
    const ctx = await tableContext(pool, c)
    const row = await selectOne<{ processing_status: string; scan_status: string }>(
      pool,
      `SELECT processing_status, scan_status FROM file_objects
        WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
      [idParam(c, 'fileId'), ctx.project.id],
    )
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json({ processing_status: row.processing_status, scan_status: row.scan_status })
  })

  for (const mode of ['thumbnail', 'preview'] as const) {
    routes.get(`/files/:fileId/${mode}`, async (c) => {
      const ctx = await tableContext(pool, c)
      return serveFile(c, pool, files, ctx.project.id, idParam(c, 'fileId'), mode, {
        audit: false,
      })
    })
  }

  return routes
}
