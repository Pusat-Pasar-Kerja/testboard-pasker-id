import { suiteCreateSchema, suiteUpdateSchema, type SuiteDto } from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import {
  execute,
  insertedId,
  iso,
  isoDate,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

interface SuiteRow {
  id: string
  name: string
  module_id: string | null
  module_code: string | null
  module_name: string | null
  description: string | null
  reference_document: string | null
  reference_url: string | null
  reference_version: string | null
  owner_unit: string | null
  scope_description: string | null
  preparation_date: Date | string | null
  source_notes: string | null
  case_count: number
  created_at: Date
}

async function listSuites(db: Db, projectId: string, suiteId?: string): Promise<SuiteDto[]> {
  const rows = await select<SuiteRow>(
    db,
    `SELECT s.id, s.name, s.module_id, m.module_code, m.name AS module_name, s.description,
            s.reference_document, s.reference_url, s.reference_version, s.owner_unit,
            s.scope_description, s.preparation_date, s.source_notes, s.created_at,
            (SELECT COUNT(*) FROM test_cases tc
              WHERE tc.suite_id = s.id AND tc.case_status <> 'ARCHIVED') AS case_count
       FROM test_suites s LEFT JOIN modules m ON m.id = s.module_id
      WHERE s.project_id = ? AND (? IS NULL OR s.id = ?)
      ORDER BY s.name`,
    [projectId, suiteId ?? null, suiteId ?? null],
  )
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    module: row.module_id
      ? {
          id: String(row.module_id),
          module_code: row.module_code ?? '',
          name: row.module_name ?? '',
        }
      : null,
    description: row.description,
    reference_document: row.reference_document,
    reference_url: row.reference_url,
    reference_version: row.reference_version,
    owner_unit: row.owner_unit,
    scope_description: row.scope_description,
    preparation_date: isoDate(row.preparation_date),
    source_notes: row.source_notes,
    case_count: Number(row.case_count),
    created_at: iso(row.created_at) as string,
  }))
}

/** FKs do not stop a module from ANOTHER project being linked; check it explicitly. */
export async function assertModuleInProject(db: Db, projectId: string, moduleId: string) {
  const row = await selectOne(db, 'SELECT 1 FROM modules WHERE id = ? AND project_id = ?', [
    moduleId,
    projectId,
  ])
  if (!row) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'module_id', message: 'Module not found in this project' },
    ])
  }
}

const SUITE_COLUMNS = [
  'name',
  'module_id',
  'description',
  'reference_document',
  'reference_url',
  'reference_version',
  'owner_unit',
  'scope_description',
  'preparation_date',
  'source_notes',
] as const

export function suiteRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('project.read'), async (c) =>
    c.json(await listSuites(pool, c.get('project').id)),
  )

  routes.get('/:suiteId', requirePermission('project.read'), async (c) => {
    const [suite] = await listSuites(pool, c.get('project').id, idParam(c, 'suiteId'))
    if (!suite) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(suite)
  })

  routes.post('/', requirePermission('suite.write'), async (c) => {
    const project = c.get('project')
    const auth = c.get('auth')
    const input = await parseBody(c, suiteCreateSchema)
    if (input.module_id) await assertModuleInProject(pool, project.id, input.module_id)
    const suiteId = await withTransaction(pool, async (conn) => {
      const result = await execute(
        conn,
        `INSERT INTO test_suites (project_id, ${SUITE_COLUMNS.join(', ')}, created_by)
         VALUES (?, ${SUITE_COLUMNS.map(() => '?').join(', ')}, ?)`,
        [project.id, ...SUITE_COLUMNS.map((col) => input[col] ?? null), auth?.userId ?? null],
      )
      const id = insertedId(result)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_suite',
        entityId: id,
        action: 'CREATE',
        newValues: input,
      })
      return id
    })
    const [created] = await listSuites(pool, project.id, suiteId)
    return c.json(created, 201)
  })

  routes.patch('/:suiteId', requirePermission('suite.write'), async (c) => {
    const project = c.get('project')
    const suiteId = idParam(c, 'suiteId')
    const input = await parseBody(c, suiteUpdateSchema)
    if (input.module_id) await assertModuleInProject(pool, project.id, input.module_id)
    const columns = SUITE_COLUMNS.filter((col) => input[col] !== undefined)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne(
        conn,
        'SELECT * FROM test_suites WHERE id = ? AND project_id = ? FOR UPDATE',
        [suiteId, project.id],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      if (columns.length > 0) {
        await execute(
          conn,
          // Column names come from the fixed allowlist above, never from the request.
          `UPDATE test_suites SET ${columns.map((col) => `${col} = ?`).join(', ')}
            WHERE id = ? AND project_id = ?`,
          [...columns.map((col) => input[col] ?? null), suiteId, project.id],
        )
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_suite',
        entityId: suiteId,
        action: 'UPDATE',
        oldValues: before,
        newValues: input,
      })
    })
    const [updated] = await listSuites(pool, project.id, suiteId)
    return c.json(updated)
  })

  return routes
}
