import {
  fileAttachSchema,
  isOneOf,
  stepsFromText,
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_TYPES,
  testCaseCloneSchema,
  testCaseCreateSchema,
  testCaseUpdateSchema,
  type ExecutionStatus,
  type Locale,
  type Paginated,
  type TestCaseDetail,
  type TestCaseListItem,
  type TestCasePriority,
  type TestCaseSourceKind,
  type TestCaseStatus,
  type TestType,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { assertAttachable, linkFiles, unlinkFile } from '../files/attach.js'
import { attachedFiles } from '../files/dto.js'
import {
  execute,
  insertedId,
  iso,
  isDuplicateKey,
  parseJson,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

export interface CaseRow {
  id: string
  project_id: string
  module_id: string | null
  module_code: string | null
  module_name: string | null
  suite_id: string | null
  suite_name: string | null
  case_code: string
  sequence_number: number | null
  category: string | null
  title: string
  requirement_refs: string | null
  priority_code: TestCasePriority
  test_type_code: TestType
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  expected_result: string | null
  source_locale: Locale
  case_status: TestCaseStatus
  source_kind: TestCaseSourceKind
  current_version: number
  created_at: Date
  updated_at: Date
  created_by: string | null
  created_by_name: string | null
  updated_by: string | null
  updated_by_name: string | null
}

const CASE_SELECT = `
  SELECT tc.*, m.module_code, m.name AS module_name, s.name AS suite_name,
         cu.display_name AS created_by_name, uu.display_name AS updated_by_name
    FROM test_cases tc
    LEFT JOIN modules m ON m.id = tc.module_id
    LEFT JOIN test_suites s ON s.id = tc.suite_id
    LEFT JOIN users cu ON cu.id = tc.created_by
    LEFT JOIN users uu ON uu.id = tc.updated_by`

const ref = (id: string | null, name: string | null) =>
  id ? { id: String(id), display_name: name ?? '' } : null

function toListItem(row: CaseRow): TestCaseListItem {
  return {
    id: String(row.id),
    case_code: row.case_code,
    title: row.title,
    module: row.module_id
      ? {
          id: String(row.module_id),
          module_code: row.module_code ?? '',
          name: row.module_name ?? '',
        }
      : null,
    category: row.category,
    priority_code: row.priority_code,
    test_type_code: row.test_type_code,
    case_status: row.case_status,
    current_version: Number(row.current_version),
    updated_at: iso(row.updated_at) as string,
    updated_by: ref(row.updated_by, row.updated_by_name),
  }
}

/** Snapshot stored in test_case_revisions (immutable record of each saved version). */
export function snapshot(row: CaseRow) {
  return {
    case_code: row.case_code,
    version: Number(row.current_version),
    module_code: row.module_code,
    suite_id: row.suite_id ? String(row.suite_id) : null,
    sequence_number: row.sequence_number,
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
    case_status: row.case_status,
  }
}

export async function loadCase(db: Db, projectId: string, caseId: string, lock = false) {
  const row = await selectOne<CaseRow>(
    db,
    `${CASE_SELECT} WHERE tc.id = ? AND tc.project_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [caseId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

async function resolveModule(db: Db, projectId: string, moduleCode: string | null | undefined) {
  if (moduleCode === undefined) return undefined
  if (moduleCode === null) return null
  const row = await selectOne<{ id: string }>(
    db,
    'SELECT id FROM modules WHERE project_id = ? AND module_code = ?',
    [projectId, moduleCode],
  )
  if (!row) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'module_code', message: 'Module not found in this project' },
    ])
  }
  return String(row.id)
}

async function assertSuite(db: Db, projectId: string, suiteId: string | null | undefined) {
  if (!suiteId) return
  const row = await selectOne(db, 'SELECT 1 FROM test_suites WHERE id = ? AND project_id = ?', [
    suiteId,
    projectId,
  ])
  if (!row) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'suite_id', message: 'Suite not found in this project' },
    ])
  }
}

/**
 * Next free UAT-<MODULE>-NNN code. The project row lock serialises concurrent creators,
 * so two users never get the same generated code.
 */
export async function nextCaseCode(
  conn: PoolConnection,
  projectId: string,
  moduleCode: string | null,
) {
  await execute(conn, 'SELECT id FROM projects WHERE id = ? FOR UPDATE', [projectId])
  const prefix = `UAT-${moduleCode ?? 'CASE'}-`
  const rows = await select<{ case_code: string }>(
    conn,
    'SELECT case_code FROM test_cases WHERE project_id = ? AND case_code LIKE ?',
    [projectId, `${prefix.replace(/[\\%_]/g, '\\$&')}%`],
  )
  const max = rows.reduce((highest, row) => {
    const n = Number.parseInt(row.case_code.slice(prefix.length), 10)
    return Number.isFinite(n) && n > highest ? n : highest
  }, 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export async function insertRevision(
  conn: PoolConnection,
  row: CaseRow,
  userId: string | null,
  reason: string,
) {
  await execute(
    conn,
    `INSERT INTO test_case_revisions (test_case_id, revision_number, snapshot_json, changed_by, change_reason)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.current_version, JSON.stringify(snapshot(row)), userId, reason.slice(0, 500)],
  )
}

function duplicateCode(): AppError {
  return new AppError(409, 'CONFLICT', 'Test case code already exists in this project.', [
    { field: 'case_code', message: 'Already used' },
  ])
}

const EDITABLE = [
  'module_id',
  'suite_id',
  'sequence_number',
  'category',
  'title',
  'requirement_refs',
  'priority_code',
  'test_type_code',
  'actor_label',
  'preconditions',
  'test_steps_text',
  'expected_result',
  'source_locale',
  'case_status',
] as const

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function testCaseRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()
  const userIdOf = (c: Context<AppEnv>) => c.get('auth')?.userId ?? null

  routes.get('/', requirePermission('case.read'), async (c) => {
    const project = c.get('project')
    const { page, pageSize, offset } = pageParams(c)
    const where: string[] = ['tc.project_id = ?']
    const params: unknown[] = [project.id]

    const q = c.req.query('q')?.trim()
    if (q) {
      where.push('(tc.case_code LIKE ? OR tc.title LIKE ?)')
      params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`)
    }
    const moduleCode = c.req.query('module')
    if (moduleCode) {
      where.push('m.module_code = ?')
      params.push(moduleCode.toUpperCase())
    }
    const suiteId = c.req.query('suite_id')
    if (suiteId && /^\d+$/.test(suiteId)) {
      where.push('tc.suite_id = ?')
      params.push(suiteId)
    }
    const priority = c.req.query('priority')
    if (isOneOf(TEST_CASE_PRIORITIES)(priority)) {
      where.push('tc.priority_code = ?')
      params.push(priority)
    }
    const type = c.req.query('type')
    if (isOneOf(TEST_TYPES)(type)) {
      where.push('tc.test_type_code = ?')
      params.push(type)
    }
    const status = c.req.query('status')
    if (isOneOf(TEST_CASE_STATUSES)(status)) {
      where.push('tc.case_status = ?')
      params.push(status)
    } else if (status !== 'ALL') {
      where.push("tc.case_status <> 'ARCHIVED'")
    }

    const sort = c.req.query('sort') === '-updated_at' ? 'tc.updated_at DESC' : 'tc.case_code'
    const filter = `WHERE ${where.join(' AND ')}`
    const countRow = await selectOne<{ total: number }>(
      pool,
      `SELECT COUNT(*) AS total FROM test_cases tc
         LEFT JOIN modules m ON m.id = tc.module_id ${filter}`,
      params,
    )
    const rows = await select<CaseRow>(
      pool,
      `${CASE_SELECT} ${filter} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const body: Paginated<TestCaseListItem> = {
      data: rows.map(toListItem),
      page,
      page_size: pageSize,
      total: Number(countRow?.total ?? 0),
    }
    return c.json(body)
  })

  routes.get('/:caseId', requirePermission('case.read'), async (c) => {
    const project = c.get('project')
    const row = await loadCase(pool, project.id, idParam(c, 'caseId'))
    const [steps, revisions, usage, files] = await Promise.all([
      select<{ step_number: number; instruction: string; expected_result: string | null }>(
        pool,
        'SELECT step_number, instruction, expected_result FROM test_case_steps WHERE test_case_id = ? ORDER BY step_number',
        [row.id],
      ),
      select<{
        revision_number: number
        changed_by: string | null
        changed_by_name: string | null
        change_reason: string | null
        changed_at: Date
      }>(
        pool,
        `SELECT r.revision_number, r.changed_by, u.display_name AS changed_by_name,
                r.change_reason, r.changed_at
           FROM test_case_revisions r LEFT JOIN users u ON u.id = r.changed_by
          WHERE r.test_case_id = ? ORDER BY r.revision_number DESC`,
        [row.id],
      ),
      select<{
        run_id: string
        run_code: string
        run_name: string
        run_case_id: string
        case_version: number
        latest_status: ExecutionStatus
        attempts: number
      }>(
        pool,
        `SELECT r.id AS run_id, r.run_code, r.name AS run_name, trc.id AS run_case_id,
                trc.case_version, v.latest_status,
                (SELECT COUNT(*) FROM test_executions e WHERE e.run_case_id = trc.id) AS attempts
           FROM test_run_cases trc
           JOIN test_runs r ON r.id = trc.test_run_id
           JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
          WHERE trc.test_case_id = ? AND r.project_id = ?
          ORDER BY r.created_at DESC`,
        [row.id, project.id],
      ),
      attachedFiles(pool, 'test_case', [String(row.id)]),
    ])
    const detail: TestCaseDetail = {
      ...toListItem(row),
      suite_name: row.suite_name,
      requirement_refs: row.requirement_refs,
      actor_label: row.actor_label,
      preconditions: row.preconditions,
      test_steps_text: row.test_steps_text,
      expected_result: row.expected_result,
      source_locale: row.source_locale === 'en' ? 'en' : 'id',
      source_kind: row.source_kind,
      created_at: iso(row.created_at) as string,
      created_by: ref(row.created_by, row.created_by_name),
      steps:
        steps.length > 0
          ? steps.map((s) => ({ ...s, step_number: Number(s.step_number) }))
          : stepsFromText(row.test_steps_text),
      revisions: revisions.map((r) => ({
        revision_number: Number(r.revision_number),
        changed_by: ref(r.changed_by, r.changed_by_name),
        change_reason: r.change_reason,
        changed_at: iso(r.changed_at) as string,
      })),
      used_in_runs: usage.map((u) => ({
        ...u,
        run_id: String(u.run_id),
        run_case_id: String(u.run_case_id),
        case_version: Number(u.case_version),
        attempts: Number(u.attempts),
      })),
      files: files.get(String(row.id)) ?? [],
    }
    return c.json(detail)
  })

  routes.get('/:caseId/revisions', requirePermission('case.read'), async (c) => {
    const project = c.get('project')
    const row = await loadCase(pool, project.id, idParam(c, 'caseId'))
    const revisions = await select<{
      revision_number: number
      snapshot_json: unknown
      change_reason: string | null
      changed_at: Date
      changed_by: string | null
      changed_by_name: string | null
    }>(
      pool,
      `SELECT r.revision_number, r.snapshot_json, r.change_reason, r.changed_at, r.changed_by,
              u.display_name AS changed_by_name
         FROM test_case_revisions r LEFT JOIN users u ON u.id = r.changed_by
        WHERE r.test_case_id = ? ORDER BY r.revision_number DESC`,
      [row.id],
    )
    return c.json(
      revisions.map((r) => ({
        revision_number: Number(r.revision_number),
        change_reason: r.change_reason,
        changed_at: iso(r.changed_at),
        changed_by: ref(r.changed_by, r.changed_by_name),
        snapshot: parseJson(r.snapshot_json),
      })),
    )
  })

  routes.post('/', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, testCaseCreateSchema)
    const caseId = await withTransaction(pool, async (conn) => {
      const moduleId = (await resolveModule(conn, project.id, input.module_code)) ?? null
      await assertSuite(conn, project.id, input.suite_id)
      const code =
        input.case_code ?? (await nextCaseCode(conn, project.id, input.module_code ?? null))
      let id: string
      try {
        const result = await execute(
          conn,
          `INSERT INTO test_cases
             (project_id, module_id, suite_id, case_code, sequence_number, category, title,
              requirement_refs, priority_code, test_type_code, actor_label, preconditions,
              test_steps_text, expected_result, source_locale, case_status, source_kind,
              current_version, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 1, ?, ?)`,
          [
            project.id,
            moduleId,
            input.suite_id ?? null,
            code,
            input.sequence_number ?? null,
            input.category ?? null,
            input.title,
            input.requirement_refs ?? null,
            input.priority_code,
            input.test_type_code,
            input.actor_label ?? null,
            input.preconditions ?? null,
            input.test_steps_text ?? null,
            input.expected_result,
            input.source_locale,
            input.case_status,
            userIdOf(c),
            userIdOf(c),
          ],
        )
        id = insertedId(result)
      } catch (error) {
        if (isDuplicateKey(error)) throw duplicateCode()
        throw error
      }
      const created = await loadCase(conn, project.id, id)
      await insertRevision(conn, created, userIdOf(c), 'Created')
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_case',
        entityId: id,
        action: 'CREATE',
        newValues: snapshot(created),
      })
      return id
    })
    return c.json(toListItem(await loadCase(pool, project.id, caseId)), 201)
  })

  routes.patch('/:caseId', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const caseId = idParam(c, 'caseId')
    const input = await parseBody(c, testCaseUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await loadCase(conn, project.id, caseId, true)
      if (
        input.expected_version !== undefined &&
        input.expected_version !== Number(before.current_version)
      ) {
        throw new AppError(
          409,
          'CONFLICT',
          'This test case was changed by someone else. Reload and try again.',
          [{ field: 'expected_version', message: `Current version is ${before.current_version}` }],
        )
      }
      const changesContent = Object.keys(input).some(
        (key) => !['case_status', 'change_reason', 'expected_version'].includes(key),
      )
      if (before.case_status === 'ARCHIVED' && changesContent) {
        throw new AppError(409, 'CONFLICT', 'Restore the archived test case before editing it.')
      }
      const moduleId = await resolveModule(conn, project.id, input.module_code)
      await assertSuite(conn, project.id, input.suite_id)

      const next: Record<(typeof EDITABLE)[number], unknown> = {
        module_id: moduleId === undefined ? before.module_id : moduleId,
        suite_id: input.suite_id === undefined ? before.suite_id : input.suite_id,
        sequence_number:
          input.sequence_number === undefined ? before.sequence_number : input.sequence_number,
        category: input.category === undefined ? before.category : input.category,
        title: input.title ?? before.title,
        requirement_refs:
          input.requirement_refs === undefined ? before.requirement_refs : input.requirement_refs,
        priority_code: input.priority_code ?? before.priority_code,
        test_type_code: input.test_type_code ?? before.test_type_code,
        actor_label: input.actor_label === undefined ? before.actor_label : input.actor_label,
        preconditions:
          input.preconditions === undefined ? before.preconditions : input.preconditions,
        test_steps_text:
          input.test_steps_text === undefined ? before.test_steps_text : input.test_steps_text,
        expected_result: input.expected_result ?? before.expected_result,
        source_locale: input.source_locale ?? before.source_locale,
        case_status: input.case_status ?? before.case_status,
      }
      const changed = EDITABLE.filter(
        (col) =>
          String(next[col] ?? '') !==
          String((before as unknown as Record<string, unknown>)[col] ?? ''),
      )
      if (changed.length === 0) return

      // Every saved change is a new version + immutable revision; runs keep their own
      // frozen snapshot, so past UAT results never change meaning (TB-CASE-003).
      await execute(
        conn,
        `UPDATE test_cases SET ${changed.map((col) => `${col} = ?`).join(', ')},
                current_version = current_version + 1, updated_by = ?
          WHERE id = ? AND project_id = ?`,
        [...changed.map((col) => next[col]), userIdOf(c), caseId, project.id],
      )
      const after = await loadCase(conn, project.id, caseId)
      const reason =
        input.change_reason ??
        (changed.length === 1 && changed[0] === 'case_status'
          ? `Status ${before.case_status} -> ${after.case_status}`
          : `Updated: ${changed.join(', ')}`)
      await insertRevision(conn, after, userIdOf(c), reason)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_case',
        entityId: caseId,
        action: changed.length === 1 && changed[0] === 'case_status' ? 'STATUS_CHANGE' : 'UPDATE',
        oldValues: Object.fromEntries(
          changed.map((col) => [col, (before as unknown as Record<string, unknown>)[col]]),
        ),
        newValues: Object.fromEntries(changed.map((col) => [col, next[col]])),
      })
    })
    return c.json(toListItem(await loadCase(pool, project.id, caseId)))
  })

  routes.post('/:caseId/archive', requirePermission('case.archive'), async (c) => {
    const project = c.get('project')
    const caseId = idParam(c, 'caseId')
    await withTransaction(pool, async (conn) => {
      const before = await loadCase(conn, project.id, caseId, true)
      if (before.case_status === 'ARCHIVED') return
      await execute(
        conn,
        `UPDATE test_cases SET case_status = 'ARCHIVED', current_version = current_version + 1,
                updated_by = ? WHERE id = ? AND project_id = ?`,
        [userIdOf(c), caseId, project.id],
      )
      const after = await loadCase(conn, project.id, caseId)
      await insertRevision(conn, after, userIdOf(c), 'Archived')
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_case',
        entityId: caseId,
        action: 'ARCHIVE',
        oldValues: { case_status: before.case_status },
        newValues: { case_status: 'ARCHIVED' },
      })
    })
    return c.json(toListItem(await loadCase(pool, project.id, caseId)))
  })

  routes.post('/:caseId/clone', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const sourceId = idParam(c, 'caseId')
    const input = await parseBody(c, testCaseCloneSchema)
    const newId = await withTransaction(pool, async (conn) => {
      const source = await loadCase(conn, project.id, sourceId)
      const code = input.case_code ?? (await nextCaseCode(conn, project.id, source.module_code))
      let id: string
      try {
        const result = await execute(
          conn,
          `INSERT INTO test_cases
             (project_id, module_id, suite_id, case_code, category, title, requirement_refs,
              priority_code, test_type_code, actor_label, preconditions, test_steps_text,
              expected_result, source_locale, case_status, source_kind, current_version,
              created_by, updated_by)
           SELECT project_id, module_id, suite_id, ?, category, title, requirement_refs,
                  priority_code, test_type_code, actor_label, preconditions, test_steps_text,
                  expected_result, source_locale, 'DRAFT', 'MANUAL', 1, ?, ?
             FROM test_cases WHERE id = ? AND project_id = ?`,
          [code, userIdOf(c), userIdOf(c), sourceId, project.id],
        )
        id = insertedId(result)
      } catch (error) {
        if (isDuplicateKey(error)) throw duplicateCode()
        throw error
      }
      const created = await loadCase(conn, project.id, id)
      await insertRevision(conn, created, userIdOf(c), `Cloned from ${source.case_code}`)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_case',
        entityId: id,
        action: 'CREATE',
        newValues: { ...snapshot(created), cloned_from: source.case_code },
      })
      return id
    })
    return c.json(toListItem(await loadCase(pool, project.id, newId)), 201)
  })

  /** Reference files for the case definition (doc 02: dokumen acuan). Leads only. */
  routes.post('/:caseId/files', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const caseId = idParam(c, 'caseId')
    const body = await parseBody(c, fileAttachSchema)
    await withTransaction(pool, async (conn) => {
      await loadCase(conn, project.id, caseId, true)
      await assertAttachable(conn, project.id, body.files)
      const added = await linkFiles(conn, 'test_case', caseId, body.files)
      if (added > 0) {
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_case',
          entityId: caseId,
          action: 'UPDATE',
          newValues: { attached_file_ids: body.files.map((f) => f.file_id) },
        })
      }
    })
    const files = await attachedFiles(pool, 'test_case', [caseId])
    return c.json(files.get(caseId) ?? [], 201)
  })

  routes.delete('/:caseId/files/:fileId', requirePermission('case.write'), async (c) => {
    const project = c.get('project')
    const caseId = idParam(c, 'caseId')
    const fileId = idParam(c, 'fileId')
    await withTransaction(pool, async (conn) => {
      await loadCase(conn, project.id, caseId, true)
      if (!(await unlinkFile(conn, 'test_case', caseId, fileId))) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.')
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_case',
        entityId: caseId,
        action: 'UPDATE',
        oldValues: { attached_file_id: fileId },
      })
    })
    return c.body(null, 204)
  })

  return routes
}
