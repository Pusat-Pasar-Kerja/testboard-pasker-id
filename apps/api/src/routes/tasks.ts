import {
  OPEN_DEFECT_STATUSES,
  tableState,
  type MyTasksDto,
  type RunStatus,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requireAuth } from '../auth/middleware.js'
import { iso, select } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import type { AppEnv } from '../types.js'

/**
 * "Tugas saya" (owner, 2026-11-24): what a signed-in person has to do, across the projects
 * they belong to - the tables they are listed at, the scenarios assigned to them, and the
 * problems they reported. Only their own rows; never someone else's work.
 */
export function taskRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/me/tasks', async (c) => {
    const auth = requireAuth(c)
    if (auth.accountKind !== 'PERSON') throw new AppError(404, 'NOT_FOUND', 'Not found.')
    c.header('Cache-Control', 'no-store')

    const tables = await select<{
      table_id: string
      table_name: string
      member_id: string
      member_name: string
      project_code: string
      project_name: string
      is_archived: number
      cycle_id: string
      cycle_title: string
      valid_from: Date | null
      valid_until: Date
      revoked_at: Date | null
    }>(
      pool,
      `SELECT t.id AS table_id, t.name AS table_name, m.id AS member_id,
              m.display_name AS member_name, p.project_code, p.name AS project_name,
              p.is_archived, c.id AS cycle_id, c.title AS cycle_title,
              t.valid_from, t.valid_until, t.revoked_at
         FROM workshop_table_members m
         JOIN workshop_tables t ON t.id = m.table_id
         JOIN projects p ON p.id = t.project_id
         JOIN test_cycles c ON c.id = t.cycle_id
        WHERE m.user_id = ?
        ORDER BY t.valid_until DESC, t.name
        LIMIT 50`,
      [auth.userId],
    )

    const runs = await select<{
      project_code: string
      project_name: string
      run_id: string
      run_name: string
      status_code: RunStatus
      assigned: number
      done: number
      next_run_case_id: string | null
    }>(
      pool,
      `SELECT p.project_code, p.name AS project_name, r.id AS run_id, r.name AS run_name,
              r.status_code, COUNT(*) AS assigned,
              SUM(v.latest_status <> 'NOT_RUN') AS done,
              MIN(CASE WHEN v.latest_status = 'NOT_RUN' THEN trc.id END) AS next_run_case_id
         FROM test_run_cases trc
         JOIN test_runs r ON r.id = trc.test_run_id
         JOIN projects p ON p.id = r.project_id
         JOIN v_run_case_latest_status v ON v.run_case_id = trc.id
        WHERE trc.assigned_to = ?
          AND r.status_code IN ('PLANNED', 'ACTIVE')
          AND p.is_archived = 0
          AND (EXISTS (SELECT 1 FROM project_members pm
                        WHERE pm.project_id = p.id AND pm.user_id = ?)
               OR ? = 1)
        GROUP BY p.project_code, p.name, r.id, r.name, r.status_code
        ORDER BY r.status_code = 'ACTIVE' DESC, r.id DESC
        LIMIT 50`,
      [auth.userId, auth.userId, auth.isAdmin ? 1 : 0],
    )

    const open = OPEN_DEFECT_STATUSES.map(() => '?').join(', ')
    const bugs = await select<{
      project_code: string
      project_name: string
      open: number
      total: number
    }>(
      pool,
      `SELECT p.project_code, p.name AS project_name,
              SUM(d.status_code IN (${open})) AS open, COUNT(*) AS total
         FROM defects d JOIN projects p ON p.id = d.project_id
        WHERE d.reported_by = ?
        GROUP BY p.project_code, p.name
        ORDER BY p.project_code`,
      [...OPEN_DEFECT_STATUSES, auth.userId],
    )

    const body: MyTasksDto = {
      tables: tables.map((row) => {
        const dates = {
          valid_from: iso(row.valid_from),
          valid_until: iso(row.valid_until) ?? '',
          revoked_at: iso(row.revoked_at),
        }
        return {
          table: { id: String(row.table_id), name: row.table_name },
          member: { id: String(row.member_id), name: row.member_name },
          project: { code: row.project_code, name: row.project_name },
          cycle: { id: String(row.cycle_id), title: row.cycle_title },
          valid_from: dates.valid_from,
          valid_until: dates.valid_until,
          state: Number(row.is_archived) === 1 ? 'REVOKED' : tableState(dates),
        }
      }),
      runs: runs.map((row) => ({
        project: { code: row.project_code, name: row.project_name },
        run: { id: String(row.run_id), name: row.run_name, status_code: row.status_code },
        assigned: Number(row.assigned),
        done: Number(row.done ?? 0),
        next_run_case_id: row.next_run_case_id === null ? null : String(row.next_run_case_id),
      })),
      bugs: bugs.map((row) => ({
        project: { code: row.project_code, name: row.project_name },
        open: Number(row.open ?? 0),
        total: Number(row.total),
      })),
    }
    return c.json(body)
  })

  return routes
}
