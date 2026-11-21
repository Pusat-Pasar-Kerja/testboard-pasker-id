import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  isOneOf,
  OPEN_DEFECT_STATUSES,
  type DefectDetail,
  type DefectListItem,
  type DefectPriority,
  type DefectSeverity,
  type DefectSourceKind,
  type DefectStatus,
  type ExecutionStatus,
  type Paginated,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import { attachedFiles } from '../files/dto.js'
import { iso, select, selectOne, type Db } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

export interface DefectRow {
  id: string
  bug_code: string
  title: string
  status_code: DefectStatus
  severity_code: DefectSeverity
  priority_code: DefectPriority
  module_id: string | null
  module_code: string | null
  module_name: string | null
  cycle_id: string | null
  cycle_code: string | null
  cycle_title: string | null
  reported_by: string | null
  reporter_name: string | null
  assigned_to: string | null
  assignee_name: string | null
  created_at: Date
  updated_at: Date
  description: string | null
  steps_to_reproduce: string | null
  expected_behavior: string | null
  actual_behavior: string | null
  source_kind: DefectSourceKind
  environment_name: string | null
  build_version: string | null
  browser_name: string | null
  fixed_in_version: string | null
  legacy_reporter_name: string | null
  reported_at: Date | null
  source_reference: string | null
}

export const DEFECT_SELECT = `
  SELECT d.*, m.module_code, m.name AS module_name,
         cy.cycle_code, cy.title AS cycle_title,
         rep.display_name AS reporter_name, asg.display_name AS assignee_name
    FROM defects d
    LEFT JOIN modules m ON m.id = d.module_id
    LEFT JOIN test_cycles cy ON cy.id = d.cycle_id
    LEFT JOIN users rep ON rep.id = d.reported_by
    LEFT JOIN users asg ON asg.id = d.assigned_to`

const person = (id: string | null, name: string | null) =>
  id ? { id: String(id), display_name: name ?? '' } : null

export function toDefectListItem(row: DefectRow): DefectListItem {
  return {
    id: String(row.id),
    bug_code: row.bug_code,
    title: row.title,
    status_code: row.status_code,
    severity_code: row.severity_code,
    priority_code: row.priority_code,
    module: row.module_id
      ? {
          id: String(row.module_id),
          module_code: row.module_code ?? '',
          name: row.module_name ?? '',
        }
      : null,
    cycle: row.cycle_id
      ? { id: String(row.cycle_id), cycle_code: row.cycle_code ?? '', title: row.cycle_title ?? '' }
      : null,
    reported_by: person(row.reported_by, row.reporter_name),
    assigned_to: person(row.assigned_to, row.assignee_name),
    created_at: iso(row.created_at) as string,
    updated_at: iso(row.updated_at) as string,
  }
}

export async function recentDefects(db: Db, projectId: string, limit: number) {
  const rows = await select<DefectRow>(
    db,
    `${DEFECT_SELECT} WHERE d.project_id = ? ORDER BY d.updated_at DESC, d.id DESC LIMIT ?`,
    [projectId, limit],
  )
  return rows.map(toDefectListItem)
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

/** Full bug view (links, status history, comments) or null when not in this project. */
export async function loadDefectDetail(
  db: Db,
  projectId: string,
  defectId: string,
): Promise<DefectDetail | null> {
  const row = await selectOne<DefectRow>(
    db,
    `${DEFECT_SELECT} WHERE d.id = ? AND d.project_id = ?`,
    [defectId, projectId],
  )
  if (!row) return null

  const [links, history, comments, files] = await Promise.all([
    select<{
      execution_id: string
      run_id: string
      run_code: string
      run_case_id: string
      case_code: string
      attempt_number: number
      result_status: ExecutionStatus
      tested_at: Date | null
    }>(
      db,
      `SELECT e.id AS execution_id, r.id AS run_id, r.run_code, trc.id AS run_case_id,
                tc.case_code, e.attempt_number, e.result_status, e.tested_at
           FROM defect_execution_links l
           JOIN test_executions e ON e.id = l.execution_id
           JOIN test_run_cases trc ON trc.id = e.run_case_id
           JOIN test_runs r ON r.id = trc.test_run_id
           JOIN test_cases tc ON tc.id = trc.test_case_id
          WHERE l.defect_id = ? AND r.project_id = ?
          ORDER BY e.tested_at, e.attempt_number`,
      [defectId, projectId],
    ),
    select<{
      from_status: DefectStatus | null
      to_status: DefectStatus
      changed_by: string | null
      changed_by_name: string | null
      change_comment: string | null
      changed_at: Date
    }>(
      db,
      `SELECT h.from_status, h.to_status, h.changed_by, u.display_name AS changed_by_name,
                h.change_comment, h.changed_at
           FROM defect_status_history h LEFT JOIN users u ON u.id = h.changed_by
          WHERE h.defect_id = ? ORDER BY h.changed_at, h.id`,
      [defectId],
    ),
    select<{
      id: string
      author_id: string | null
      author_name: string | null
      body: string
      created_at: Date
    }>(
      db,
      `SELECT cm.id, cm.author_id, u.display_name AS author_name, cm.body, cm.created_at
           FROM defect_comments cm LEFT JOIN users u ON u.id = cm.author_id
          WHERE cm.defect_id = ? ORDER BY cm.created_at, cm.id`,
      [defectId],
    ),
    attachedFiles(db, 'defect', [defectId]),
  ])
  const detail: DefectDetail = {
    ...toDefectListItem(row),
    description: row.description,
    steps_to_reproduce: row.steps_to_reproduce,
    expected_behavior: row.expected_behavior,
    actual_behavior: row.actual_behavior,
    source_kind: row.source_kind,
    legacy_reporter_name: row.legacy_reporter_name,
    reported_at: iso(row.reported_at),
    source_reference: row.source_reference,
    environment_name: row.environment_name,
    build_version: row.build_version,
    browser_name: row.browser_name,
    fixed_in_version: row.fixed_in_version,
    linked_executions: links.map((l) => ({
      execution_id: String(l.execution_id),
      run_id: String(l.run_id),
      run_code: l.run_code,
      run_case_id: String(l.run_case_id),
      case_code: l.case_code,
      attempt_number: Number(l.attempt_number),
      result_status: l.result_status,
      tested_at: iso(l.tested_at),
    })),
    history: history.map((h) => ({
      from_status: h.from_status,
      to_status: h.to_status,
      changed_by: person(h.changed_by, h.changed_by_name),
      change_comment: h.change_comment,
      changed_at: iso(h.changed_at) as string,
    })),
    comments: comments.map((cm) => ({
      id: String(cm.id),
      author: person(cm.author_id, cm.author_name),
      body: cm.body,
      created_at: iso(cm.created_at) as string,
    })),
    files: files.get(String(defectId)) ?? [],
  }
  return detail
}

/** Bug reads. Writes (create, edit, status workflow, comments, links) are in defects-write.ts. */
export function defectRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const { page, pageSize, offset } = pageParams(c)
    const where = ['d.project_id = ?']
    const params: unknown[] = [project.id]
    const status = c.req.query('status')
    if (status === 'open') {
      where.push(`d.status_code IN (${OPEN_DEFECT_STATUSES.map(() => '?').join(', ')})`)
      params.push(...OPEN_DEFECT_STATUSES)
    } else if (isOneOf(DEFECT_STATUSES)(status)) {
      where.push('d.status_code = ?')
      params.push(status)
    }
    const severity = c.req.query('severity')
    if (isOneOf(DEFECT_SEVERITIES)(severity)) {
      where.push('d.severity_code = ?')
      params.push(severity)
    }
    const priority = c.req.query('priority')
    if (isOneOf(DEFECT_PRIORITIES)(priority)) {
      where.push('d.priority_code = ?')
      params.push(priority)
    }
    const assignee = c.req.query('assigned_to')
    if (assignee === 'none') where.push('d.assigned_to IS NULL')
    else if (assignee && /^\d{1,20}$/.test(assignee)) {
      where.push('d.assigned_to = ?')
      params.push(assignee)
    }
    const cycle = c.req.query('cycle')
    if (cycle === 'none') where.push('d.cycle_id IS NULL')
    else if (cycle && /^\d{1,20}$/.test(cycle)) {
      where.push('d.cycle_id = ?')
      params.push(cycle)
    }
    const q = c.req.query('q')?.trim()
    if (q) {
      where.push('(d.bug_code LIKE ? OR d.title LIKE ?)')
      params.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`)
    }
    const filter = `WHERE ${where.join(' AND ')}`
    const total = await selectOne<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM defects d ${filter}`,
      params,
    )
    const rows = await select<DefectRow>(
      pool,
      `${DEFECT_SELECT} ${filter} ORDER BY d.updated_at DESC, d.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const body: Paginated<DefectListItem> = {
      data: rows.map(toDefectListItem),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  routes.get('/:defectId', requirePermission('project.read'), async (c) => {
    const detail = await loadDefectDetail(pool, c.get('project').id, idParam(c, 'defectId'))
    if (!detail) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(detail)
  })

  routes.get('/:defectId/history', requirePermission('project.read'), async (c) => {
    const detail = await loadDefectDetail(pool, c.get('project').id, idParam(c, 'defectId'))
    if (!detail) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(detail.history)
  })

  routes.get('/:defectId/comments', requirePermission('project.read'), async (c) => {
    const detail = await loadDefectDetail(pool, c.get('project').id, idParam(c, 'defectId'))
    if (!detail) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(detail.comments)
  })

  return routes
}
