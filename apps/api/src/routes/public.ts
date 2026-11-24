import {
  isOneOf,
  MEMBER_ROLES,
  normalizePublicFields,
  PUBLIC_DONE_STATUSES,
  publicBugReportSchema,
  roleCan,
  type ExecutionStatus,
  type Paginated,
  type PublicBugDto,
  type PublicBugReportingDto,
  type PublicFeatureDto,
  type PublicField,
  type PublicUatDetail,
  type PublicUatSummary,
} from '@testboard/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { clientIp } from '../auth/sessions.js'
import { execute, isoDate, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import type { FileService } from '../files/pipeline.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import { uatFeatures, uatPublicFields, uatTotals, type UatRow } from '../uat/service.js'
import { BUG_SELECT, defectFileRefs, listTables, type BugRow } from '../workshop/service.js'
import { PUBLIC_BUGS_WHERE, readBugReporting } from './bug-reporting.js'
import { nextBugCode } from './defects-write.js'
import { serveFile } from './files.js'

/**
 * Public pages (ADR 0016, 0019). Nothing is visible unless an Admin switched it on: a UAT
 * with its own fields, and a project's Bug Reporting with its own fields and, optionally, the
 * public report form. Everything else never leaves the server. No login, read only (except
 * the report form, which is rate limited and reviewed before anything shows).
 */
type PublicUatRow = UatRow & {
  project_code: string
  project_name: string
  project_id: string
  description: string | null
  starts_on: Date | null
  ends_on: Date | null
}

const isRole = isOneOf(MEMBER_ROLES)

const PUBLIC_UAT_SELECT = `
  SELECT r.id, r.project_id, r.cycle_id, r.run_code, r.name, r.status_code, r.starts_at, r.ends_at,
         r.environment_name, r.build_version, r.is_public, r.public_fields_json, r.public_intro,
         c.cycle_code, c.title AS cycle_title, c.description, c.starts_on, c.ends_on,
         p.project_code, p.name AS project_name
    FROM test_runs r
    JOIN projects p ON p.id = r.project_id
    LEFT JOIN test_cycles c ON c.id = r.cycle_id`

async function publicUats(db: Db, runId?: string): Promise<PublicUatRow[]> {
  return select<PublicUatRow>(
    db,
    `${PUBLIC_UAT_SELECT}
      WHERE r.is_public = 1 AND p.is_archived = 0 AND (? IS NULL OR r.id = ?)
      ORDER BY FIELD(r.status_code, 'ACTIVE', 'PLANNED', 'COMPLETED', 'LOCKED'),
               r.starts_at DESC, r.id DESC`,
    [runId ?? null, runId ?? null],
  )
}

/** A lead of the project (or an Admin) may preview a page before it is published. */
async function isLeadOf(db: Db, c: Context<AppEnv>, projectId: string): Promise<boolean> {
  const auth = c.get('auth')
  if (!auth || auth.accountKind !== 'PERSON') return false
  if (auth.isAdmin) return true
  const member = await selectOne<{ role_code: string }>(
    db,
    'SELECT role_code FROM project_members WHERE project_id = ? AND user_id = ?',
    [projectId, auth.userId],
  )
  return Boolean(member && isRole(member.role_code) && roleCan(member.role_code, 'run.write'))
}

/**
 * The UAT behind a public page. With "?preview=1" a lead sees it before it is published,
 * optionally with field choices that are not saved yet ("&fields=a,b"); everyone else gets
 * 404 for a UAT that is not public.
 */
async function resolveUat(
  db: Db,
  c: Context<AppEnv>,
  runId: string,
): Promise<{ row: PublicUatRow; fields: PublicField[] }> {
  if (c.req.query('preview') !== '1') {
    const [row] = await publicUats(db, runId)
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return { row, fields: uatPublicFields(row) }
  }
  const row = await selectOne<PublicUatRow>(db, `${PUBLIC_UAT_SELECT} WHERE r.id = ?`, [runId])
  if (!row || !(await isLeadOf(db, c, String(row.project_id)))) {
    throw new AppError(404, 'NOT_FOUND', 'Not found.')
  }
  const chosen = c.req.query('fields')
  return {
    row,
    fields: chosen === undefined ? uatPublicFields(row) : normalizePublicFields(chosen.split(',')),
  }
}

async function summary(
  db: Db,
  row: PublicUatRow,
  fields: PublicField[],
): Promise<PublicUatSummary> {
  const has = (f: PublicField) => fields.includes(f)
  const bugReporting = await readBugReporting(db, String(row.project_id))
  return {
    id: String(row.id),
    project: { code: row.project_code, name: row.project_name },
    name: row.name,
    phase: row.cycle_id ? { cycle_code: row.cycle_code ?? '', title: row.cycle_title ?? '' } : null,
    intro: row.public_intro,
    status_code: row.status_code,
    ...(has('cycle.description') ? { description: row.description } : {}),
    ...(has('cycle.period')
      ? {
          period: {
            starts_on: isoDate(row.starts_at ?? row.starts_on),
            ends_on: isoDate(row.ends_at ?? row.ends_on),
          },
        }
      : {}),
    ...(has('cycle.progress') ? { progress: await uatTotals(db, String(row.id)) } : {}),
    fields,
    bug_reporting_public: bugReporting.is_public,
  }
}

// ---- Bug Reporting ----------------------------------------------------------------------

async function publicProject(db: Db, code: string) {
  const project = await selectOne<{ id: string; project_code: string; name: string }>(
    db,
    'SELECT id, project_code, name FROM projects WHERE project_code = ? AND is_archived = 0',
    [code.toUpperCase()],
  )
  if (!project) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return project
}

/** The project's Bug Reporting as the public sees it (404 while it is switched off). */
async function resolveBugReporting(db: Db, c: Context<AppEnv>, code: string) {
  const project = await publicProject(db, code)
  const settings = await readBugReporting(db, String(project.id))
  const preview = c.req.query('preview') === '1' && (await isLeadOf(db, c, String(project.id)))
  if (!settings.is_public && !preview) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return { project, settings }
}

async function bugReportingDto(
  db: Db,
  project: { id: string; project_code: string; name: string },
  settings: Awaited<ReturnType<typeof readBugReporting>>,
): Promise<PublicBugReportingDto> {
  const counted = await selectOne<{ n: number; open_n: string | number | null }>(
    db,
    `SELECT COUNT(*) AS n, SUM(d.status_code NOT IN (?)) AS open_n
       FROM defects d WHERE ${PUBLIC_BUGS_WHERE}`,
    [[...PUBLIC_DONE_STATUSES], project.id],
  )
  const showsFeatures =
    settings.public_fields.includes('bugs.list') && settings.public_fields.includes('bugs.feature')
  const features = showsFeatures
    ? await select<{ name: string }>(
        db,
        `SELECT DISTINCT m.name FROM defects d JOIN modules m ON m.id = d.module_id
          WHERE ${PUBLIC_BUGS_WHERE}
          ORDER BY m.name`,
        [project.id],
      )
    : []
  return {
    project: { code: project.project_code, name: project.name },
    intro: settings.public_intro,
    fields: settings.public_fields,
    accept_reports: settings.accept_reports,
    bug_count: settings.public_fields.includes('bugs.list') ? Number(counted?.n ?? 0) : 0,
    bug_open: settings.public_fields.includes('bugs.list') ? Number(counted?.open_n ?? 0) : 0,
    ...(showsFeatures ? { features: features.map((f) => f.name) } : {}),
  }
}

/** Reports per IP: at most 5 in 10 minutes and 20 a day (one server process). */
const reportTimes = new Map<string, number[]>()
function allowReport(ip: string, now = Date.now()): boolean {
  const day = 24 * 60 * 60 * 1000
  const times = (reportTimes.get(ip) ?? []).filter((t) => now - t < day)
  const recent = times.filter((t) => now - t < 10 * 60 * 1000)
  if (recent.length >= 5 || times.length >= 20) {
    reportTimes.set(ip, times)
    return false
  }
  times.push(now)
  reportTimes.set(ip, times)
  if (reportTimes.size > 5000) {
    for (const [key, list] of reportTimes) {
      if (list.every((t) => now - t >= day)) reportTimes.delete(key)
    }
  }
  return true
}

export function publicRoutes(pool: Pool, files: FileService) {
  const routes = new Hono<AppEnv>()

  // ---- UAT ------------------------------------------------------------------------------
  routes.get('/uats', async (c) => {
    const rows = await publicUats(pool)
    return c.json(await Promise.all(rows.map((row) => summary(pool, row, uatPublicFields(row)))))
  })

  routes.get('/uats/:runId', async (c) => {
    const { row, fields } = await resolveUat(pool, c, idParam(c, 'runId'))
    const base = await summary(pool, row, fields)
    const has = (f: PublicField) => base.fields.includes(f)
    const detail: PublicUatDetail = { ...base }
    const runId = String(row.id)

    if (has('features.list')) {
      const features = await uatFeatures(pool, runId, { includeHidden: false })
      const tables = has('features.tables')
        ? await listTables(pool, String(row.project_id), { runId })
        : []
      const cases = has('features.cases')
        ? await select<{ module_id: string; title: string; latest_status: ExecutionStatus }>(
            pool,
            `SELECT tc.module_id, tc.title, v.latest_status
               FROM v_run_case_latest_status v JOIN test_cases tc ON tc.id = v.test_case_id
              WHERE v.test_run_id = ?
              ORDER BY tc.case_code
              LIMIT 5000`,
            [runId],
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
    return c.json(detail)
  })

  /** Links printed before UATs existed point at a Fase: answer its first public UAT. */
  routes.get('/cycles/:cycleId/uat', async (c) => {
    const row = await selectOne<{ id: string }>(
      pool,
      `SELECT r.id FROM test_runs r JOIN projects p ON p.id = r.project_id
        WHERE r.cycle_id = ? AND r.is_public = 1 AND p.is_archived = 0
        ORDER BY r.starts_at DESC, r.id DESC LIMIT 1`,
      [idParam(c, 'cycleId')],
    )
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json({ id: String(row.id) })
  })

  // ---- Bug Reporting --------------------------------------------------------------------
  routes.get('/bug-reporting', async (c) => {
    const projects = await select<{ id: string; project_code: string; name: string }>(
      pool,
      `SELECT p.id, p.project_code, p.name FROM projects p
         JOIN project_settings s ON s.project_id = p.id AND s.setting_key = 'bugs.public'
        WHERE p.is_archived = 0 AND s.value_json = 'true'
        ORDER BY p.name`,
    )
    const out: PublicBugReportingDto[] = []
    for (const project of projects) {
      const settings = await readBugReporting(pool, String(project.id))
      if (settings.is_public) out.push(await bugReportingDto(pool, project, settings))
    }
    return c.json(out)
  })

  routes.get('/projects/:projectCode/bug-reporting', async (c) => {
    const { project, settings } = await resolveBugReporting(
      pool,
      c,
      c.req.param('projectCode') ?? '',
    )
    return c.json(await bugReportingDto(pool, project, settings))
  })

  routes.get('/projects/:projectCode/bugs', async (c) => {
    const { project, settings } = await resolveBugReporting(
      pool,
      c,
      c.req.param('projectCode') ?? '',
    )
    const fields = settings.public_fields
    const has = (f: PublicField) => fields.includes(f)
    if (!has('bugs.list')) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const { page, pageSize, offset } = pageParams(c)
    const query = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 200)
    const feature = c.req.query('feature') ?? ''
    const status = c.req.query('status') ?? ''
    let rows = await select<BugRow>(
      pool,
      `${BUG_SELECT} WHERE ${PUBLIC_BUGS_WHERE} ORDER BY d.created_at DESC, d.id DESC LIMIT 5000`,
      [project.id],
    )
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
    // A feature is chosen by its name on the public page (codes are internal).
    if (feature && has('bugs.feature')) {
      rows = rows.filter((r) => r.module_name === feature || r.module_code === feature)
    }
    const done = (code: string) => (PUBLIC_DONE_STATUSES as readonly string[]).includes(code)
    if (status === 'OPEN') rows = rows.filter((r) => !done(r.status_code))
    else if (status === 'DONE') rows = rows.filter((r) => done(r.status_code))
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

  /** Photos of public problems, only while "Foto layar" is switched on. */
  for (const mode of ['thumbnail', 'preview'] as const) {
    routes.get(`/projects/:projectCode/files/:fileId/${mode}`, async (c) => {
      const { project, settings } = await resolveBugReporting(
        pool,
        c,
        c.req.param('projectCode') ?? '',
      )
      if (!settings.public_fields.includes('bugs.evidence')) {
        throw new AppError(404, 'NOT_FOUND', 'Not found.')
      }
      const fileId = idParam(c, 'fileId')
      const linked = await selectOne(
        pool,
        `SELECT 1 FROM defect_files df JOIN defects d ON d.id = df.defect_id
          WHERE df.file_object_id = ? AND ${PUBLIC_BUGS_WHERE}`,
        [fileId, project.id],
      )
      if (!linked) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      return serveFile(c, pool, files, String(project.id), fileId, mode, { audit: false })
    })
  }

  /**
   * The public report form (after go-live). Accepted only while an Admin has switched it on;
   * a filled trap field means a robot and is dropped quietly; at most a few reports per
   * device. A report never shows publicly until an Admin has reviewed it.
   */
  routes.post('/projects/:projectCode/reports', async (c) => {
    const project = await publicProject(pool, c.req.param('projectCode') ?? '')
    const settings = await readBugReporting(pool, String(project.id))
    if (!settings.is_public || !settings.accept_reports) {
      throw new AppError(404, 'NOT_FOUND', 'Not found.')
    }
    const input = await parseBody(c, publicBugReportSchema)
    if (input.website) return c.json({ received: true }, 201)
    if (!allowReport(clientIp(c) ?? 'unknown')) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many reports from this device. Try again later.')
    }
    const feature = input.feature
      ? await selectOne<{ id: string }>(
          pool,
          'SELECT id FROM modules WHERE project_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
          [project.id, input.feature],
        )
      : null
    await withTransaction(pool, async (conn) => {
      const bugCode = await nextBugCode(conn, String(project.id), project.project_code)
      const description =
        input.feature && !feature
          ? `Halaman/fitur: ${input.feature}\n\n${input.description}`
          : input.description
      const result = await execute(
        conn,
        `INSERT INTO defects
           (project_id, module_id, bug_code, title, description, actual_behavior, severity_code,
            priority_code, status_code, source_kind, reported_by, legacy_reporter_name,
            reporter_contact, reported_at)
         VALUES (?, ?, ?, ?, ?, ?, 'MEDIUM', 'MEDIUM', 'OPEN', 'PUBLIC', NULL, ?, ?, UTC_TIMESTAMP(3))`,
        [
          project.id,
          feature?.id ?? null,
          bugCode,
          input.title,
          description,
          input.description,
          input.reporter_name ?? null,
          input.contact ?? null,
        ],
      )
      const id = String(result.insertId)
      await execute(
        conn,
        `INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by)
         VALUES (?, NULL, 'OPEN', NULL)`,
        [id],
      )
      await writeAudit(conn, c, {
        projectId: String(project.id),
        entityType: 'defect',
        entityId: id,
        action: 'CREATE',
        newValues: { bug_code: bugCode, title: input.title, source_kind: 'PUBLIC' },
      })
    })
    return c.json({ received: true }, 201)
  })

  return routes
}
