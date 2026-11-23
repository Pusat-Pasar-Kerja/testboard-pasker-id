import {
  canTransitionDefect,
  cyclePublicSchema,
  defectReviewSchema,
  normalizePublicFields,
  textCloseness,
  workshopFeatureStateSchema,
  workshopTableCreateSchema,
  workshopTableUpdateSchema,
  type DefectStatus,
  type ExecutionStatus,
  type ModuleRef,
  type WorkshopBoardDto,
  type WorkshopInboxItem,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { randomBytes } from 'node:crypto'
import { requirePermission } from '../access/project-access.js'
import { revokeUserSessions } from '../auth/sessions.js'
import {
  execute,
  insertedId,
  iso,
  isDuplicateKey,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import {
  cycleBugRows,
  cycleFeatures,
  cycleTotals,
  featureCases,
  freeAccessCode,
  listTables,
  loadCycle,
  saveTableMembers,
  tableMemberRows,
  publicFieldsOf,
  toWorkshopBugs,
  type TableRow,
} from '../workshop/service.js'
import { applyDefectStatus } from './defects-write.js'

const invalid = (field: string, message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [{ field, message }])

async function assertRunOfCycle(db: Db, cycleId: string, runId: string | null | undefined) {
  if (!runId) return
  const run = await selectOne(db, 'SELECT 1 FROM test_runs WHERE id = ? AND cycle_id = ?', [
    runId,
    cycleId,
  ])
  if (!run) throw invalid('run_id', 'Run not found in this cycle')
}

async function assertModules(db: Db, projectId: string, moduleIds: string[]) {
  const ids = [...new Set(moduleIds)]
  if (ids.length === 0) return ids
  const rows = await select<{ id: string }>(
    db,
    `SELECT id FROM modules WHERE project_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
    [projectId, ...ids],
  )
  if (rows.length !== ids.length) throw invalid('module_ids', 'Module not found in this project')
  return ids
}

async function setTableModules(conn: PoolConnection, tableId: string, moduleIds: string[]) {
  await execute(conn, 'DELETE FROM workshop_table_modules WHERE table_id = ?', [tableId])
  for (const moduleId of moduleIds) {
    await execute(conn, 'INSERT INTO workshop_table_modules (table_id, module_id) VALUES (?, ?)', [
      tableId,
      moduleId,
    ])
  }
}

const duplicateName = () =>
  new AppError(409, 'CONFLICT', 'A table with this name already exists in this cycle.', [
    { field: 'name', message: 'Already used' },
  ])

/**
 * Facilitator side of Mode Workshop (ADR 0016): public settings of a Fase, tables (meja)
 * with printable cards, the live board and the "Masalah masuk" review list.
 */
export function workshopAdminRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  // ---- Live board ----------------------------------------------------------------------
  routes.get('/:cycleId/workshop', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const cycleId = String(cycle.id)
    const [totals, features, tables, bugStats, recent] = await Promise.all([
      cycleTotals(pool, cycleId),
      cycleFeatures(pool, cycleId, { includeHidden: true }),
      listTables(pool, project.id, cycleId),
      selectOne<{ total: number; to_review: number; confirmations: number }>(
        pool,
        `SELECT
           SUM(d.duplicate_of_id IS NULL) AS total,
           SUM(d.duplicate_of_id IS NULL AND d.reviewed_at IS NULL AND u.auth_provider = 'WORKSHOP') AS to_review,
           (SELECT COUNT(*) FROM defect_confirmations dc JOIN defects d2 ON d2.id = dc.defect_id
             WHERE d2.cycle_id = ?) AS confirmations
           FROM defects d LEFT JOIN users u ON u.id = d.reported_by
          WHERE d.project_id = ? AND d.cycle_id = ?`,
        [cycleId, project.id, cycleId],
      ),
      recentActivity(pool, cycleId),
    ])
    const board: WorkshopBoardDto = {
      cycle: {
        id: cycleId,
        cycle_code: cycle.cycle_code,
        title: cycle.title,
        is_public: Number(cycle.is_public) === 1,
        public_fields: publicFieldsOf(cycle),
        public_intro: cycle.public_intro,
      },
      totals,
      bugs: {
        total: Number(bugStats?.total ?? 0),
        to_review: Number(bugStats?.to_review ?? 0),
        confirmations: Number(bugStats?.confirmations ?? 0),
      },
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        member_names: t.member_names,
        state: t.state,
        modules: t.modules,
        progress: t.progress,
        bugs: t.open_bugs,
        last_activity_at: t.last_activity_at,
      })),
      features,
      recent,
    }
    c.header('Cache-Control', 'no-store')
    return c.json(board)
  })

  // ---- Public visibility ---------------------------------------------------------------
  routes.put('/:cycleId/public', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const input = await parseBody(c, cyclePublicSchema)
    const fields = normalizePublicFields(input.public_fields)
    await withTransaction(pool, async (conn) => {
      await execute(
        conn,
        'UPDATE test_cycles SET is_public = ?, public_fields_json = ?, public_intro = ? WHERE id = ?',
        [input.is_public ? 1 : 0, JSON.stringify(fields), input.public_intro ?? null, cycle.id],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_cycle',
        entityId: String(cycle.id),
        action: 'UPDATE',
        oldValues: {
          is_public: Number(cycle.is_public) === 1,
          public_fields: publicFieldsOf(cycle),
          public_intro: cycle.public_intro,
        },
        newValues: {
          is_public: input.is_public,
          public_fields: fields,
          public_intro: input.public_intro ?? null,
        },
      })
    })
    return c.json({
      is_public: input.is_public,
      public_fields: fields,
      public_intro: input.public_intro ?? null,
    })
  })

  routes.put('/:cycleId/features', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const input = await parseBody(c, workshopFeatureStateSchema)
    await assertModules(pool, project.id, [input.module_id])
    await withTransaction(pool, async (conn) => {
      await execute(
        conn,
        `INSERT INTO workshop_features (cycle_id, module_id, state_code) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE state_code = VALUES(state_code)`,
        [cycle.id, input.module_id, input.state_code],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_cycle',
        entityId: String(cycle.id),
        action: 'UPDATE',
        newValues: { feature_module_id: input.module_id, state_code: input.state_code },
      })
    })
    return c.json(await cycleFeatures(pool, String(cycle.id), { includeHidden: true }))
  })

  // ---- Tables (meja) -------------------------------------------------------------------
  routes.get('/:cycleId/tables', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    c.header('Cache-Control', 'no-store')
    return c.json(await listTables(pool, project.id, String(cycle.id)))
  })

  routes.post('/:cycleId/tables', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const input = await parseBody(c, workshopTableCreateSchema)
    await assertRunOfCycle(pool, String(cycle.id), input.run_id)
    const moduleIds = await assertModules(pool, project.id, input.module_ids)
    const tableId = await withTransaction(pool, async (conn) => {
      // The table signs in as its own account: no password, no e-mail login (ADR 0016).
      const user = await execute(
        conn,
        `INSERT INTO users (display_name, email, password_hash, auth_provider, preferred_locale)
         VALUES (?, ?, NULL, 'WORKSHOP', 'id')`,
        [input.name, `meja-${randomBytes(9).toString('hex')}@meja.invalid`],
      )
      let id = ''
      for (let attempt = 0; attempt < 5 && !id; attempt += 1) {
        try {
          const result = await execute(
            conn,
            `INSERT INTO workshop_tables
               (project_id, cycle_id, run_id, user_id, name, access_code,
                valid_from, valid_until, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              project.id,
              cycle.id,
              input.run_id,
              insertedId(user),
              input.name,
              await freeAccessCode(conn),
              input.valid_from ? new Date(input.valid_from) : null,
              new Date(input.valid_until),
              c.get('auth')?.userId ?? null,
            ],
          )
          id = insertedId(result)
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
          const sameName = await selectOne(
            conn,
            'SELECT 1 FROM workshop_tables WHERE cycle_id = ? AND name = ?',
            [cycle.id, input.name],
          )
          if (sameName) throw duplicateName()
        }
      }
      if (!id) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Could not create the table card.')
      await setTableModules(conn, id, moduleIds)
      // People with an e-mail become User accounts (Penguji) right here (ADR 0018).
      await saveTableMembers(conn, c, project.id, id, input.members)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'workshop_table',
        entityId: id,
        action: 'CREATE',
        newValues: {
          name: input.name,
          run_id: input.run_id,
          module_ids: moduleIds,
          member_names: input.members.map((m) => m.name),
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until,
        },
      })
      return id
    })
    const [created] = await listTables(pool, project.id, String(cycle.id), tableId)
    return c.json(created, 201)
  })

  routes.patch('/:cycleId/tables/:tableId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const tableId = idParam(c, 'tableId')
    const input = await parseBody(c, workshopTableUpdateSchema)
    await assertRunOfCycle(pool, String(cycle.id), input.run_id)
    const moduleIds = input.module_ids
      ? await assertModules(pool, project.id, input.module_ids)
      : null
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<TableRow>(
        conn,
        'SELECT * FROM workshop_tables WHERE id = ? AND cycle_id = ? FOR UPDATE',
        [tableId, cycle.id],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      const validFrom =
        input.valid_from === undefined
          ? before.valid_from
          : input.valid_from
            ? new Date(input.valid_from)
            : null
      const validUntil = input.valid_until ? new Date(input.valid_until) : before.valid_until
      if (validFrom && validFrom >= validUntil) {
        throw invalid('valid_until', 'The card must end after it starts')
      }
      const code = input.regenerate_code ? await freeAccessCode(conn) : before.access_code
      try {
        await execute(
          conn,
          `UPDATE workshop_tables
              SET name = ?, run_id = ?, access_code = ?,
                  valid_from = ?, valid_until = ?,
                  revoked_at = CASE WHEN ? = 1 THEN COALESCE(revoked_at, UTC_TIMESTAMP(3))
                                    WHEN ? = 0 THEN NULL ELSE revoked_at END
            WHERE id = ?`,
          [
            input.name ?? before.name,
            input.run_id === undefined ? before.run_id : input.run_id,
            code,
            validFrom,
            validUntil,
            input.revoked === true ? 1 : -1,
            input.revoked === false ? 0 : -1,
            tableId,
          ],
        )
      } catch (error) {
        if (isDuplicateKey(error)) throw duplicateName()
        throw error
      }
      if (input.name) {
        await execute(conn, 'UPDATE users SET display_name = ? WHERE id = ?', [
          input.name,
          before.user_id,
        ])
      }
      if (moduleIds) await setTableModules(conn, tableId, moduleIds)
      const membersBefore = (await tableMemberRows(conn, [tableId])).get(tableId) ?? []
      if (input.members) await saveTableMembers(conn, c, project.id, tableId, input.members)
      // A new code or a blocked card signs every device of this table out right away; a
      // shorter validity shortens the open sessions too.
      if (input.regenerate_code || input.revoked === true) {
        await revokeUserSessions(conn, String(before.user_id))
      } else if (input.valid_until) {
        await execute(
          conn,
          `UPDATE user_sessions SET expires_at = LEAST(expires_at, ?)
            WHERE user_id = ? AND revoked_at IS NULL`,
          [validUntil, before.user_id],
        )
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'workshop_table',
        entityId: tableId,
        action: input.revoked === true ? 'REVOKE' : 'UPDATE',
        oldValues: {
          name: before.name,
          run_id: before.run_id === null ? null : String(before.run_id),
          member_names: membersBefore.map((m) => m.display_name),
          valid_from: iso(before.valid_from),
          valid_until: iso(before.valid_until),
          revoked: Boolean(before.revoked_at),
        },
        newValues: {
          ...input,
          members: undefined,
          member_names: input.members?.map((m) => m.name),
          module_ids: moduleIds ?? undefined,
        },
      })
    })
    const [updated] = await listTables(pool, project.id, String(cycle.id), tableId)
    return c.json(updated)
  })

  /** Remove a table that never answered anything; one with answers can only be blocked. */
  routes.delete('/:cycleId/tables/:tableId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const tableId = idParam(c, 'tableId')
    await withTransaction(pool, async (conn) => {
      const row = await selectOne<TableRow>(
        conn,
        'SELECT * FROM workshop_tables WHERE id = ? AND cycle_id = ? FOR UPDATE',
        [tableId, cycle.id],
      )
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      const used = await selectOne<{ n: number }>(
        conn,
        `SELECT (SELECT COUNT(*) FROM test_executions WHERE tester_id = ?)
              + (SELECT COUNT(*) FROM defects WHERE reported_by = ?)
              + (SELECT COUNT(*) FROM defect_confirmations WHERE user_id = ?) AS n`,
        [row.user_id, row.user_id, row.user_id],
      )
      if (Number(used?.n ?? 0) > 0) {
        throw new AppError(409, 'CONFLICT', 'This table already has answers; block it instead.', [
          { field: 'table', message: 'HAS_ACTIVITY' },
        ])
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'workshop_table',
        entityId: tableId,
        action: 'DELETE',
        oldValues: { name: row.name },
      })
      // Removing the account removes the table, its features and its sessions (cascade).
      await execute(conn, 'DELETE FROM users WHERE id = ? AND auth_provider = ?', [
        row.user_id,
        'WORKSHOP',
      ])
    })
    return c.body(null, 204)
  })

  /** Everything a paper backup sheet for one table needs (cetak lembar cadangan). */
  routes.get('/:cycleId/tables/:tableId/sheet', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const [table] = await listTables(pool, project.id, String(cycle.id), idParam(c, 'tableId'))
    if (!table) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const features: { module: ModuleRef; cases: Awaited<ReturnType<typeof featureCases>> }[] = []
    for (const module of table.modules) {
      features.push({
        module,
        cases: table.run ? await featureCases(pool, table.run.id, module.id, null) : [],
      })
    }
    return c.json({ table, features })
  })

  // ---- "Masalah masuk": problems from tables waiting for a facilitator -------------------
  routes.get('/:cycleId/inbox', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const all = await cycleBugRows(pool, project.id, String(cycle.id))
    const waiting = all.filter((r) => r.table_name !== null && r.reviewed_at === null)
    const bugs = await toWorkshopBugs(pool, waiting.slice(0, 200), null)
    const scenarios = await select<{
      defect_id: string
      run_case_id: string
      case_code: string
      title: string
    }>(
      pool,
      `SELECT l.defect_id, trc.id AS run_case_id, tc.case_code, tc.title
         FROM defect_execution_links l
         JOIN test_executions e ON e.id = l.execution_id
         JOIN test_run_cases trc ON trc.id = e.run_case_id
         JOIN test_cases tc ON tc.id = trc.test_case_id
         JOIN defects d ON d.id = l.defect_id
        WHERE d.project_id = ? AND d.cycle_id = ? AND d.reviewed_at IS NULL`,
      [project.id, cycle.id],
    )
    const items: WorkshopInboxItem[] = bugs.map((bug, index) => {
      const row = waiting[index]!
      const text = `${row.title} ${row.actual_behavior ?? row.description ?? ''}`
      const similar = all
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
        .map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }))
      const scenario = scenarios.find((s) => String(s.defect_id) === bug.id)
      return {
        ...bug,
        priority_code: row.priority_code,
        scenario: scenario
          ? {
              run_case_id: String(scenario.run_case_id),
              case_code: scenario.case_code,
              title: scenario.title,
            }
          : null,
        similar,
      }
    })
    c.header('Cache-Control', 'no-store')
    return c.json(items)
  })

  routes.post('/:cycleId/inbox/:defectId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const cycle = await loadCycle(pool, project.id, idParam(c, 'cycleId'))
    const defectId = idParam(c, 'defectId')
    const input = await parseBody(c, defectReviewSchema)
    await withTransaction(pool, async (conn) => {
      const row = await selectOne<{
        id: string
        bug_code: string
        status_code: DefectStatus
        severity_code: string
        priority_code: string
        duplicate_of_id: string | null
        reviewed_at: Date | null
      }>(
        conn,
        `SELECT id, bug_code, status_code, severity_code, priority_code, duplicate_of_id,
                  reviewed_at
             FROM defects WHERE id = ? AND project_id = ? AND cycle_id = ? FOR UPDATE`,
        [defectId, project.id, cycle.id],
      )
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      let duplicateCode: string | null = null
      if (input.duplicate_of_id) {
        if (input.duplicate_of_id === defectId) throw invalid('duplicate_of_id', 'Same bug')
        const target = await selectOne<{
          id: string
          bug_code: string
          duplicate_of_id: string | null
        }>(
          conn,
          'SELECT id, bug_code, duplicate_of_id FROM defects WHERE id = ? AND project_id = ? AND cycle_id = ?',
          [input.duplicate_of_id, project.id, cycle.id],
        )
        if (!target || target.duplicate_of_id) {
          throw invalid('duplicate_of_id', 'Choose a bug that is not itself a duplicate')
        }
        duplicateCode = target.bug_code
        // The scenarios where this was found now point to the bug it duplicates.
        await execute(
          conn,
          `INSERT IGNORE INTO defect_execution_links (defect_id, execution_id)
             SELECT ?, execution_id FROM defect_execution_links WHERE defect_id = ?`,
          [target.id, defectId],
        )
        // Bugs that pointed here follow along to the new target.
        await execute(conn, 'UPDATE defects SET duplicate_of_id = ? WHERE duplicate_of_id = ?', [
          target.id,
          defectId,
        ])
      }
      await execute(
        conn,
        `UPDATE defects
              SET severity_code = COALESCE(?, severity_code),
                  priority_code = COALESCE(?, priority_code),
                  duplicate_of_id = CASE WHEN ? = 1 THEN ? ELSE duplicate_of_id END,
                  reviewed_at = CASE WHEN ? = 1 THEN COALESCE(reviewed_at, UTC_TIMESTAMP(3))
                                     WHEN ? = 0 THEN NULL ELSE reviewed_at END,
                  reviewed_by = CASE WHEN ? = 1 THEN ? WHEN ? = 0 THEN NULL ELSE reviewed_by END
            WHERE id = ?`,
        [
          input.severity_code ?? null,
          input.priority_code ?? null,
          input.duplicate_of_id === undefined ? 0 : 1,
          input.duplicate_of_id ?? null,
          input.reviewed === true || input.duplicate_of_id ? 1 : input.reviewed === false ? 0 : -1,
          input.reviewed === false ? 0 : -1,
          input.reviewed === true || input.duplicate_of_id ? 1 : -1,
          c.get('auth')?.userId ?? null,
          input.reviewed === false ? 0 : -1,
          defectId,
        ],
      )
      if (duplicateCode && canTransitionDefect(row.status_code, 'WONT_FIX')) {
        await applyDefectStatus(conn, c, defectId, {
          status_code: 'WONT_FIX',
          comment: `Duplikat dari ${duplicateCode}`,
        })
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'defect',
        entityId: defectId,
        action: 'REVIEW',
        oldValues: {
          severity_code: row.severity_code,
          priority_code: row.priority_code,
          duplicate_of_id: row.duplicate_of_id === null ? null : String(row.duplicate_of_id),
          reviewed: row.reviewed_at !== null,
        },
        newValues: input,
      })
    })
    const rows = await cycleBugRows(pool, project.id, String(cycle.id), {
      includeDuplicates: true,
      ids: [defectId],
    })
    const [bug] = await toWorkshopBugs(pool, rows, null)
    return c.json(bug)
  })

  return routes
}

/** Last answers, problems and "+1" from tables in this Fase (newest first). */
async function recentActivity(db: Db, cycleId: string): Promise<WorkshopBoardDto['recent']> {
  const [results, bugs, confirms] = await Promise.all([
    select<{
      at: Date
      table_name: string
      tester_name: string | null
      title: string
      status: ExecutionStatus
    }>(
      db,
      `SELECT e.tested_at AS at, wt.name AS table_name, e.legacy_tester_name AS tester_name,
              tc.title, e.result_status AS status
         FROM test_executions e
         JOIN workshop_tables wt ON wt.user_id = e.tester_id
         JOIN test_run_cases trc ON trc.id = e.run_case_id
         JOIN test_cases tc ON tc.id = trc.test_case_id
        WHERE wt.cycle_id = ?
        ORDER BY e.tested_at DESC, e.id DESC LIMIT 15`,
      [cycleId],
    ),
    select<{ at: Date; table_name: string; tester_name: string | null; title: string }>(
      db,
      `SELECT d.created_at AS at, wt.name AS table_name, d.legacy_reporter_name AS tester_name,
              d.title
         FROM defects d JOIN workshop_tables wt ON wt.user_id = d.reported_by
        WHERE d.cycle_id = ?
        ORDER BY d.created_at DESC, d.id DESC LIMIT 15`,
      [cycleId],
    ),
    select<{ at: Date; table_name: string; tester_name: string | null; title: string }>(
      db,
      `SELECT dc.created_at AS at, wt.name AS table_name, dc.tester_name, d.title
         FROM defect_confirmations dc
         JOIN workshop_tables wt ON wt.user_id = dc.user_id
         JOIN defects d ON d.id = dc.defect_id
        WHERE d.cycle_id = ?
        ORDER BY dc.created_at DESC, dc.id DESC LIMIT 15`,
      [cycleId],
    ),
  ])
  return [
    ...results.map((r) => ({ ...r, kind: 'RESULT' as const })),
    ...bugs.map((r) => ({ ...r, kind: 'BUG' as const, status: null })),
    ...confirms.map((r) => ({ ...r, kind: 'CONFIRM' as const, status: null })),
  ]
    .map((r) => ({ ...r, at: iso(r.at) ?? '' }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15)
}
