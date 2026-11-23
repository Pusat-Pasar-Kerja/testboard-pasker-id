import {
  isOneOf,
  MEMBER_ROLES,
  normalizePublicFields,
  roleCan,
  type ExecutionStatus,
  type Paginated,
  type PublicBugDto,
  type PublicCycleDetail,
  type PublicCycleSummary,
  type PublicFeatureDto,
  type PublicField,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { isoDate, select, selectOne, type Db } from '../db/tx.js'
import type { FileService } from '../files/pipeline.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import {
  cycleBugRows,
  cycleFeatures,
  cycleTotals,
  defectFileRefs,
  listTables,
  publicFieldsOf,
  type CycleRow,
} from '../workshop/service.js'
import { serveFile } from './files.js'

/**
 * Public pages of a Fase (ADR 0016). Nothing is visible unless a lead switched the Fase to
 * public, and then only the fields that were switched on; everything else never leaves the
 * server. No login, read only.
 */
type PublicCycleRow = CycleRow & { project_code: string; project_name: string }

const isRole = isOneOf(MEMBER_ROLES)

async function publicCycles(db: Db, cycleId?: string): Promise<PublicCycleRow[]> {
  return select<PublicCycleRow>(
    db,
    `SELECT c.*, p.project_code, p.name AS project_name
       FROM test_cycles c JOIN projects p ON p.id = c.project_id
      WHERE c.is_public = 1 AND p.is_archived = 0 AND (? IS NULL OR c.id = ?)
      ORDER BY FIELD(c.status_code, 'ACTIVE', 'PLANNED', 'COMPLETED'), c.starts_on DESC, c.id DESC`,
    [cycleId ?? null, cycleId ?? null],
  )
}

async function oneCycle(db: Db, cycleId: string): Promise<PublicCycleRow> {
  const [row] = await publicCycles(db, cycleId)
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

/**
 * The Fase behind a public page. With "?preview=1" a lead of the project (or a Super Admin)
 * sees the public page before it is published, optionally with field choices that are not
 * saved yet ("&fields=a,b"). Everyone else gets 404 for a Fase that is not public.
 */
async function resolveCycle(
  db: Db,
  c: Context<AppEnv>,
  cycleId: string,
): Promise<{ row: PublicCycleRow; fields: PublicField[] }> {
  if (c.req.query('preview') !== '1') {
    const row = await oneCycle(db, cycleId)
    return { row, fields: publicFieldsOf(row) }
  }
  const auth = c.get('auth')
  const row = await selectOne<PublicCycleRow & { role_code: string | null }>(
    db,
    `SELECT c.*, p.project_code, p.name AS project_name, m.role_code
       FROM test_cycles c JOIN projects p ON p.id = c.project_id
       LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
      WHERE c.id = ?`,
    [auth?.userId ?? null, cycleId],
  )
  const lead =
    auth?.accountKind === 'PERSON' &&
    row !== null &&
    (auth.isSuperAdmin || (isRole(row.role_code) && roleCan(row.role_code, 'run.write')))
  if (!row || !lead) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  const chosen = c.req.query('fields')
  return {
    row,
    fields: chosen === undefined ? publicFieldsOf(row) : normalizePublicFields(chosen.split(',')),
  }
}

async function summary(
  db: Db,
  row: PublicCycleRow,
  fields: PublicField[] = publicFieldsOf(row),
): Promise<PublicCycleSummary> {
  const has = (f: PublicField) => fields.includes(f)
  return {
    id: String(row.id),
    project: { code: row.project_code, name: row.project_name },
    cycle_code: row.cycle_code,
    title: row.title,
    intro: row.public_intro,
    status_code: row.status_code,
    ...(has('cycle.description') ? { description: row.description } : {}),
    ...(has('cycle.period')
      ? { period: { starts_on: isoDate(row.starts_on), ends_on: isoDate(row.ends_on) } }
      : {}),
    ...(has('cycle.progress') ? { progress: await cycleTotals(db, String(row.id)) } : {}),
    fields,
  }
}

export function publicRoutes(pool: Pool, files: FileService) {
  const routes = new Hono<AppEnv>()

  routes.get('/cycles', async (c) => {
    const rows = await publicCycles(pool)
    return c.json(await Promise.all(rows.map((row) => summary(pool, row))))
  })

  routes.get('/cycles/:cycleId', async (c) => {
    const { row, fields: chosen } = await resolveCycle(pool, c, idParam(c, 'cycleId'))
    const base = await summary(pool, row, chosen)
    const has = (f: PublicField) => base.fields.includes(f)
    const detail: PublicCycleDetail = { ...base }
    const cycleId = String(row.id)

    if (has('features.list')) {
      const features = await cycleFeatures(pool, cycleId, { includeHidden: false })
      const tables = has('features.tables')
        ? await listTables(pool, String(row.project_id), cycleId)
        : []
      const cases = has('features.cases')
        ? await select<{ module_id: string; title: string; latest_status: ExecutionStatus }>(
            pool,
            `SELECT tc.module_id, tc.title, v.latest_status
               FROM test_runs r
               JOIN v_run_case_latest_status v ON v.test_run_id = r.id
               JOIN test_cases tc ON tc.id = v.test_case_id
              WHERE r.cycle_id = ?
              ORDER BY tc.case_code
              LIMIT 5000`,
            [cycleId],
          )
        : []
      detail.features = features.map((feature): PublicFeatureDto => {
        const out: PublicFeatureDto = {
          name: feature.module.name,
          module_code: feature.module.module_code,
          state: feature.state,
        }
        if (has('features.progress')) out.progress = feature.progress
        if (has('features.cases')) {
          out.cases = cases
            .filter((cs) => String(cs.module_id) === feature.module.id)
            .slice(0, 300)
            .map((cs) => ({ title: cs.title, status: cs.latest_status }))
        }
        if (has('features.tables')) {
          out.tables = tables
            .filter(
              (t) => t.state !== 'REVOKED' && t.modules.some((m) => m.id === feature.module.id),
            )
            .map((t) => ({
              name: t.name,
              ...(has('features.members') ? { members: t.member_names } : {}),
            }))
        }
        return out
      })
    }
    if (has('bugs.list')) {
      const counted = await selectOne<{ n: number }>(
        pool,
        'SELECT COUNT(*) AS n FROM defects WHERE cycle_id = ? AND duplicate_of_id IS NULL',
        [cycleId],
      )
      detail.bug_count = Number(counted?.n ?? 0)
    }
    return c.json(detail)
  })

  routes.get('/cycles/:cycleId/bugs', async (c) => {
    const { row, fields } = await resolveCycle(pool, c, idParam(c, 'cycleId'))
    const has = (f: PublicField) => fields.includes(f)
    if (!has('bugs.list')) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const { page, pageSize, offset } = pageParams(c)
    const query = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 200)
    const feature = c.req.query('feature') ?? ''
    const status = c.req.query('status') ?? ''
    let rows = await cycleBugRows(pool, String(row.project_id), String(row.id))
    if (query) {
      rows = rows.filter((r) =>
        [
          r.title,
          has('bugs.code') ? r.bug_code : '',
          has('bugs.description') ? (r.actual_behavior ?? r.description ?? '') : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    }
    if (feature && has('bugs.feature')) rows = rows.filter((r) => r.module_code === feature)
    if (status === 'OPEN') {
      rows = rows.filter((r) => !['CLOSED', 'VERIFIED', 'WONT_FIX'].includes(r.status_code))
    } else if (status === 'DONE') {
      rows = rows.filter((r) => ['CLOSED', 'VERIFIED', 'WONT_FIX'].includes(r.status_code))
    }
    const pageRows = rows.slice(offset, offset + pageSize)
    const filesOf = has('bugs.evidence')
      ? await defectFileRefs(
          pool,
          pageRows.map((r) => String(r.id)),
        )
      : new Map()
    const data: PublicBugDto[] = pageRows.map((r) => {
      const bug: PublicBugDto = { id: String(r.id), title: r.title, status_code: r.status_code }
      if (has('bugs.code')) bug.bug_code = r.bug_code
      if (has('bugs.feature')) bug.feature = r.module_name
      if (has('bugs.description')) bug.description = r.actual_behavior ?? r.description
      if (has('bugs.severity')) bug.severity_code = r.severity_code
      if (has('bugs.priority')) bug.priority_code = r.priority_code
      if (has('bugs.reporter')) {
        bug.reporter = r.table_name
          ? [r.table_name, r.legacy_reporter_name].filter(Boolean).join(' · ')
          : (r.reporter_name ?? r.legacy_reporter_name)
      }
      if (has('bugs.date')) bug.reported_at = (r.reported_at ?? r.created_at).toISOString()
      if (has('bugs.confirmations'))
        bug.confirmations = Number(r.confirmations) + Number(r.duplicates)
      if (has('bugs.evidence')) {
        bug.files = (
          (filesOf.get(String(r.id)) ?? []) as {
            id: string
            original_filename: string
            ready: boolean
          }[]
        )
          .filter((f) => f.ready)
          .map((f) => ({ id: f.id, name: f.original_filename }))
      }
      return bug
    })
    const body: Paginated<PublicBugDto> = { data, page, page_size: pageSize, total: rows.length }
    return c.json(body)
  })

  /** Photos of public problems, only while "Screenshot / foto" is switched on. */
  for (const mode of ['thumbnail', 'preview'] as const) {
    routes.get(`/cycles/:cycleId/files/:fileId/${mode}`, async (c) => {
      const { row, fields } = await resolveCycle(pool, c, idParam(c, 'cycleId'))
      if (!fields.includes('bugs.evidence')) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.')
      }
      const fileId = idParam(c, 'fileId')
      const linked = await selectOne(
        pool,
        `SELECT 1 FROM defect_files df JOIN defects d ON d.id = df.defect_id
          WHERE df.file_object_id = ? AND d.cycle_id = ?`,
        [fileId, row.id],
      )
      if (!linked) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      return serveFile(c, pool, files, String(row.project_id), fileId, mode, { audit: false })
    })
  }

  return routes
}
