import {
  cycleCreateSchema,
  cycleUpdateSchema,
  type CycleDto,
  type CycleStatus,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { requirePermission } from '../access/project-access.js'
import {
  execute,
  insertedId,
  isDuplicateKey,
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

async function listCycles(db: Db, projectId: string, cycleId?: string): Promise<CycleDto[]> {
  const rows = await select<{
    id: string
    cycle_code: string
    title: string
    description: string | null
    status_code: CycleStatus
    starts_on: Date | string | null
    ends_on: Date | string | null
    run_count: number
  }>(
    db,
    `SELECT c.*, (SELECT COUNT(*) FROM test_runs r WHERE r.cycle_id = c.id) AS run_count
       FROM test_cycles c
      WHERE c.project_id = ? AND (? IS NULL OR c.id = ?)
      ORDER BY c.starts_on DESC, c.id DESC`,
    [projectId, cycleId ?? null, cycleId ?? null],
  )
  return rows.map((row) => ({
    id: String(row.id),
    cycle_code: row.cycle_code,
    title: row.title,
    description: row.description,
    status_code: row.status_code,
    starts_on: isoDate(row.starts_on),
    ends_on: isoDate(row.ends_on),
    run_count: Number(row.run_count),
  }))
}

/** Test cycles (e.g. "UAT Phase 1 - 2026"): a grouping of runs over a period. */
export function cycleRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.get('/', requirePermission('project.read'), async (c) =>
    c.json(await listCycles(pool, c.get('project').id)),
  )

  routes.post('/', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, cycleCreateSchema)
    const cycleId = await withTransaction(pool, async (conn) => {
      try {
        const result = await execute(
          conn,
          `INSERT INTO test_cycles (project_id, cycle_code, title, description, starts_on, ends_on, status_code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            project.id,
            input.cycle_code,
            input.title,
            input.description ?? null,
            input.starts_on ?? null,
            input.ends_on ?? null,
            input.status_code,
          ],
        )
        const id = insertedId(result)
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_cycle',
          entityId: id,
          action: 'CREATE',
          newValues: input,
        })
        return id
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'Cycle code already exists in this project.', [
            { field: 'cycle_code', message: 'Already used' },
          ])
        }
        throw error
      }
    })
    const [created] = await listCycles(pool, project.id, cycleId)
    return c.json(created, 201)
  })

  routes.patch('/:cycleId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycleId = idParam(c, 'cycleId')
    const input = await parseBody(c, cycleUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<{ starts_on: Date | null; ends_on: Date | null }>(
        conn,
        'SELECT title, description, starts_on, ends_on, status_code FROM test_cycles WHERE id = ? AND project_id = ? FOR UPDATE',
        [cycleId, project.id],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      const startsOn = input.starts_on === undefined ? isoDate(before.starts_on) : input.starts_on
      const endsOn = input.ends_on === undefined ? isoDate(before.ends_on) : input.ends_on
      if (startsOn && endsOn && startsOn > endsOn) {
        throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
          { field: 'ends_on', message: 'End date must not be before the start date' },
        ])
      }
      await execute(
        conn,
        `UPDATE test_cycles SET title = COALESCE(?, title),
                description = IF(?, ?, description),
                starts_on = ?, ends_on = ?,
                status_code = COALESCE(?, status_code)
          WHERE id = ? AND project_id = ?`,
        [
          input.title ?? null,
          input.description !== undefined ? 1 : 0,
          input.description ?? null,
          startsOn,
          endsOn,
          input.status_code ?? null,
          cycleId,
          project.id,
        ],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_cycle',
        entityId: cycleId,
        action: 'UPDATE',
        oldValues: before,
        newValues: input,
      })
    })
    const [updated] = await listCycles(pool, project.id, cycleId)
    return c.json(updated)
  })

  return routes
}
