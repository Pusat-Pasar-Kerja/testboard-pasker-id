import {
  BUG_PUBLIC_FIELDS,
  bugReportingSettingsSchema,
  defectReviewSchema,
  normalizePublicFields,
  textCloseness,
  type BugReportingSettings,
  type PublicField,
  type WorkshopInboxItem,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { execute, parseJson, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import { BUG_SELECT, toWorkshopBugs, type BugRow } from '../workshop/service.js'
import { reviewDefect } from './uats.js'

/**
 * Bug Reporting (ADR 0019): one problem list per project, filled during UAT and, after
 * go-live, by the public. It has its own public ON/OFF switch and fields, and a public report
 * form an Admin can switch on; every public report waits for an Admin before it shows.
 * Settings live in project_settings under "bugs.*".
 */
const KEYS = {
  is_public: 'bugs.public',
  public_fields: 'bugs.public_fields',
  public_intro: 'bugs.public_intro',
  accept_reports: 'bugs.accept_reports',
} as const

const onlyBugFields = (fields: readonly string[]): PublicField[] =>
  normalizePublicFields(fields).filter((f) => (BUG_PUBLIC_FIELDS as string[]).includes(f))

export async function readBugReporting(db: Db, projectId: string): Promise<BugReportingSettings> {
  const rows = await select<{ setting_key: string; value_json: unknown }>(
    db,
    `SELECT setting_key, value_json FROM project_settings
      WHERE project_id = ? AND setting_key IN (?, ?, ?, ?)`,
    [projectId, KEYS.is_public, KEYS.public_fields, KEYS.public_intro, KEYS.accept_reports],
  )
  const value = (key: string) =>
    parseJson<unknown>(rows.find((r) => r.setting_key === key)?.value_json)
  const fields = value(KEYS.public_fields)
  const intro = value(KEYS.public_intro)
  return {
    is_public: value(KEYS.is_public) === true,
    public_fields: onlyBugFields(Array.isArray(fields) ? fields.map(String) : []),
    public_intro: typeof intro === 'string' && intro.trim() ? intro : null,
    accept_reports: value(KEYS.accept_reports) === true,
  }
}

/** Problems the public may see: not a duplicate, and a public report only once reviewed. */
export const PUBLIC_BUGS_WHERE = `d.project_id = ? AND d.duplicate_of_id IS NULL
  AND (d.source_kind <> 'PUBLIC' OR d.reviewed_at IS NOT NULL)`

export function bugReportingRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('run.write'), async (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json(await readBugReporting(pool, c.get('project').id))
  })

  routes.put('/', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, bugReportingSettingsSchema)
    const before = await readBugReporting(pool, project.id)
    const next: BugReportingSettings = {
      is_public: input.is_public,
      public_fields: onlyBugFields(input.public_fields),
      public_intro: input.public_intro ?? null,
      accept_reports: input.accept_reports,
    }
    await withTransaction(pool, async (conn) => {
      for (const [field, key] of Object.entries(KEYS) as [keyof typeof KEYS, string][]) {
        await execute(
          conn,
          `INSERT INTO project_settings (project_id, setting_key, value_json, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by)`,
          [project.id, key, JSON.stringify(next[field]), c.get('auth')?.userId ?? null],
        )
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'project',
        entityId: project.id,
        action: 'UPDATE',
        oldValues: { bug_reporting: before },
        newValues: { bug_reporting: next },
      })
    })
    return c.json(next)
  })

  /** Reports from the public form that an Admin has not looked at yet. */
  routes.get('/reports', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const all = await select<BugRow & { reporter_contact: string | null; source_kind: string }>(
      pool,
      `${BUG_SELECT.replace('SELECT d.id,', 'SELECT d.reporter_contact, d.source_kind, d.id,')}
        WHERE d.project_id = ? AND d.duplicate_of_id IS NULL
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 2000`,
      [project.id],
    )
    const waiting = all.filter((r) => r.source_kind === 'PUBLIC' && r.reviewed_at === null)
    const bugs = await toWorkshopBugs(pool, waiting.slice(0, 200), null)
    const items: (WorkshopInboxItem & { contact: string | null; reporter: string | null })[] =
      bugs.map((bug, index) => {
        const row = waiting[index]!
        const text = `${row.title} ${row.description ?? ''}`
        return {
          ...bug,
          priority_code: row.priority_code,
          scenario: null,
          reporter: row.legacy_reporter_name,
          contact: row.reporter_contact,
          similar: all
            .filter((other) => String(other.id) !== bug.id)
            .map((other) => ({
              id: String(other.id),
              bug_code: other.bug_code,
              title: other.title,
              score: textCloseness(
                text,
                `${other.title} ${other.actual_behavior ?? other.description ?? ''}`,
              ),
            }))
            .filter((s) => s.score >= 0.3)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 })),
        }
      })
    c.header('Cache-Control', 'no-store')
    return c.json(items)
  })

  routes.post('/reports/:defectId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    const input = await parseBody(c, defectReviewSchema)
    await reviewDefect(pool, c, project.id, defectId, input)
    return c.body(null, 204)
  })

  /** Throw away a public report that is not a real problem (spam, test, wrong place). */
  routes.delete('/reports/:defectId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const defectId = idParam(c, 'defectId')
    await withTransaction(pool, async (conn) => {
      const row = await selectOne<{ bug_code: string; title: string }>(
        conn,
        `SELECT bug_code, title FROM defects
          WHERE id = ? AND project_id = ? AND source_kind = 'PUBLIC' AND reviewed_at IS NULL
          FOR UPDATE`,
        [defectId, project.id],
      )
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: defectId,
        action: 'DELETE',
        oldValues: { bug_code: row.bug_code, title: row.title },
      })
      await execute(conn, 'DELETE FROM defects WHERE id = ?', [defectId])
    })
    return c.body(null, 204)
  })

  return routes
}
