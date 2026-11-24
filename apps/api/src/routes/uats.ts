import {
  canTransitionDefect,
  cyclePublicSchema,
  defectReviewSchema,
  normalizePublicFields,
  textCloseness,
  uatCreateSchema,
  uatParticipantsAddSchema,
  uatFeatureAssigneesSchema,
  uatParticipantUpdateSchema,
  uatUpdateSchema,
  workshopFeatureStateSchema,
  workshopTableCreateSchema,
  workshopTableUpdateSchema,
  type DefectStatus,
  type ExecutionStatus,
  type ModuleRef,
  type UatDetailDto,
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
  assertUatAccess,
  loadUat,
  managesProject,
  participantDto,
  participantRows,
  placeParticipant,
  featureAssignments,
  saveGroupMembers,
  setFeatureAssignees,
  setUatFeatures,
  uatFeatures,
  uatPublicFields,
  uatRef,
  uatSummaries,
  uatTotals,
  type UatRow,
} from '../uat/service.js'
import {
  BUG_SELECT,
  featureCases,
  freeAccessCode,
  listTables,
  tableMemberRows,
  toWorkshopBugs,
  type BugRow,
  type TableRow,
} from '../workshop/service.js'
import { applyDefectStatus } from './defects-write.js'
import { nextRunCode } from './runs-write.js'

const invalid = (field: string, message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [{ field, message }])

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ')

async function assertModules(db: Db, projectId: string, moduleIds: string[]) {
  const ids = [...new Set(moduleIds)]
  if (ids.length === 0) return ids
  const rows = await select<{ id: string }>(
    db,
    `SELECT id FROM modules WHERE project_id = ? AND id IN (${placeholders(ids.length)})`,
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
  new AppError(409, 'CONFLICT', 'A group with this name already exists in this UAT.', [
    { field: 'name', message: 'Already used' },
  ])

/** A group needs its UAT to sit in a Fase (workshop_tables.cycle_id). */
function phaseOf(uat: UatRow): string {
  if (!uat.cycle_id) throw invalid('cycle_id', 'This UAT has no Fase')
  return String(uat.cycle_id)
}

/** Problems that belong to a UAT: reported by its groups, or found in its scenarios. */
const UAT_BUGS_WHERE = `d.project_id = ? AND (
     d.reported_by IN (SELECT user_id FROM workshop_tables WHERE run_id = ?)
     OR EXISTS (SELECT 1 FROM defect_execution_links l
                  JOIN test_executions e ON e.id = l.execution_id
                  JOIN test_run_cases trc ON trc.id = e.run_case_id
                 WHERE l.defect_id = d.id AND trc.test_run_id = ?))`

async function uatBugRows(
  db: Db,
  projectId: string,
  runId: string,
  options: { includeDuplicates?: boolean; ids?: string[] } = {},
): Promise<BugRow[]> {
  const ids = options.ids ?? []
  return select<BugRow>(
    db,
    `${BUG_SELECT}
      WHERE ${UAT_BUGS_WHERE}
        ${options.includeDuplicates ? '' : 'AND d.duplicate_of_id IS NULL'}
        ${ids.length ? `AND d.id IN (${placeholders(ids.length)})` : ''}
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT 2000`,
    [projectId, runId, runId, ...ids],
  )
}

/**
 * UAT (ADR 0019): the list and the wizard, the participants and their groups (meja with a
 * printable QR card), the features and the public view of one UAT, the live board and the
 * "Masalah masuk" review list. A Pengguna sees only the UATs they take part in.
 */
export function uatRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  // ---- List, create, detail, update ----------------------------------------------------
  routes.get('/', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const onlyFor = managesProject(project) ? undefined : c.get('auth')?.userId
    const list = await uatSummaries(pool, project.id, { onlyFor: onlyFor ?? undefined })
    c.header('Cache-Control', 'no-store')
    return c.json(list.map(({ row: _row, ...summary }) => summary))
  })

  routes.post('/', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const input = await parseBody(c, uatCreateSchema)
    const cycle = await selectOne<{ id: string }>(
      pool,
      'SELECT id FROM test_cycles WHERE id = ? AND project_id = ?',
      [input.cycle_id, project.id],
    )
    if (!cycle) throw invalid('cycle_id', 'Cycle not found in this project')
    const moduleIds = await assertModules(pool, project.id, input.module_ids)
    const runId = await withTransaction(pool, async (conn) => {
      const code = await nextRunCode(conn, project.id)
      const result = await execute(
        conn,
        `INSERT INTO test_runs (project_id, cycle_id, run_code, name, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          input.cycle_id,
          code,
          input.name,
          input.starts_at ? new Date(input.starts_at) : null,
          input.ends_at ? new Date(input.ends_at) : null,
          c.get('auth')?.userId ?? null,
        ],
      )
      const id = insertedId(result)
      await setUatFeatures(conn, id, moduleIds)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: id,
        action: 'CREATE',
        newValues: {
          name: input.name,
          cycle_id: input.cycle_id,
          module_ids: moduleIds,
          run_code: code,
        },
      })
      return id
    })
    return c.json(await uatDetail(pool, project.id, runId), 201)
  })

  routes.get('/:runId', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    await assertUatAccess(c, pool, runId)
    c.header('Cache-Control', 'no-store')
    return c.json(
      await uatDetail(
        pool,
        project.id,
        runId,
        managesProject(project) ? undefined : c.get('auth')?.userId,
      ),
    )
  })

  routes.patch('/:runId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const input = await parseBody(c, uatUpdateSchema)
    const moduleIds = input.module_ids
      ? await assertModules(pool, project.id, input.module_ids)
      : null
    await withTransaction(pool, async (conn) => {
      const before = await loadUat(conn, project.id, runId)
      if (before.status_code === 'LOCKED') {
        throw new AppError(409, 'CONFLICT', 'The UAT is locked and cannot be changed.')
      }
      await execute(
        conn,
        'UPDATE test_runs SET name = ?, starts_at = ?, ends_at = ? WHERE id = ?',
        [
          input.name ?? before.name,
          input.starts_at === undefined
            ? before.starts_at
            : input.starts_at
              ? new Date(input.starts_at)
              : null,
          input.ends_at === undefined
            ? before.ends_at
            : input.ends_at
              ? new Date(input.ends_at)
              : null,
          runId,
        ],
      )
      if (moduleIds) await setUatFeatures(conn, runId, moduleIds)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'UPDATE',
        oldValues: { name: before.name },
        newValues: { ...input, module_ids: moduleIds ?? undefined },
      })
    })
    return c.json(await uatDetail(pool, project.id, runId))
  })

  // ---- Participants (Pengguna UAT) -----------------------------------------------------
  routes.get('/:runId/participants', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    c.header('Cache-Control', 'no-store')
    return c.json((await participantRows(pool, String(uat.id))).map(participantDto))
  })

  routes.post('/:runId/participants', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const input = await parseBody(c, uatParticipantsAddSchema)
    await withTransaction(pool, async (conn) => {
      for (const [index, person] of input.people.entries()) {
        await placeParticipant(conn, c, project.id, String(uat.id), person, index)
      }
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: String(uat.id),
        action: 'UPDATE',
        newValues: { member_names: input.people.map((p) => p.name) },
      })
    })
    return c.json((await participantRows(pool, String(uat.id))).map(participantDto), 201)
  })

  routes.patch('/:runId/participants/:participantId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const participantId = idParam(c, 'participantId')
    const input = await parseBody(c, uatParticipantUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const row = await selectOne<{ id: string; display_name: string; user_id: string | null }>(
        conn,
        'SELECT id, display_name, user_id FROM workshop_table_members WHERE id = ? AND run_id = ?',
        [participantId, uat.id],
      )
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      if (input.group_id) {
        const group = await selectOne(
          conn,
          'SELECT 1 FROM workshop_tables WHERE id = ? AND run_id = ?',
          [input.group_id, uat.id],
        )
        if (!group) throw invalid('group_id', 'Group not found in this UAT')
      }
      await execute(
        conn,
        `UPDATE workshop_table_members
            SET table_id = CASE WHEN ? = 1 THEN ? ELSE table_id END,
                display_name = CASE WHEN ? IS NOT NULL AND user_id IS NULL THEN ? ELSE display_name END
          WHERE id = ?`,
        [
          input.group_id === undefined ? 0 : 1,
          input.group_id ?? null,
          input.name ?? null,
          input.name ?? null,
          participantId,
        ],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: String(uat.id),
        action: 'UPDATE',
        newValues: { member: row.display_name, ...input },
      })
    })
    const rows = await participantRows(pool, String(uat.id))
    const updated = rows.find((r) => String(r.id) === participantId)
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(participantDto(updated))
  })

  routes.delete(
    '/:runId/participants/:participantId',
    requirePermission('run.write'),
    async (c) => {
      const project = c.get('project')
      const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
      const participantId = idParam(c, 'participantId')
      await withTransaction(pool, async (conn) => {
        const row = await selectOne<{ display_name: string }>(
          conn,
          'SELECT display_name FROM workshop_table_members WHERE id = ? AND run_id = ?',
          [participantId, uat.id],
        )
        if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
        await execute(conn, 'DELETE FROM workshop_table_members WHERE id = ?', [participantId])
        await writeAudit(conn, c, {
          projectId: project.id,
          entityType: 'test_run',
          entityId: String(uat.id),
          action: 'UPDATE',
          oldValues: { member: row.display_name },
        })
      })
      return c.body(null, 204)
    },
  )

  // ---- Feature assignments (ADR 0020): groups and people per feature -------------------
  routes.get('/:runId/assignments', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    c.header('Cache-Control', 'no-store')
    return c.json(await featureAssignments(pool, String(uat.id)))
  })

  routes.put('/:runId/features/:moduleId/assignees', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const runId = idParam(c, 'runId')
    const moduleId = idParam(c, 'moduleId')
    const input = await parseBody(c, uatFeatureAssigneesSchema)
    await withTransaction(pool, async (conn) => {
      const uat = await loadUat(conn, project.id, runId)
      if (uat.status_code === 'LOCKED') {
        throw new AppError(409, 'CONFLICT', 'The UAT is locked and cannot be changed.')
      }
      const [before] = await featureAssignments(conn, runId, moduleId)
      await setFeatureAssignees(conn, runId, moduleId, input)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: runId,
        action: 'UPDATE',
        oldValues: before
          ? {
              feature: before.module.name,
              groups: before.groups.map((g) => g.name),
              people: before.people.map((p) => p.name),
            }
          : undefined,
        newValues: { feature_id: moduleId, ...input },
      })
    })
    const [after] = await featureAssignments(pool, runId, moduleId)
    if (!after) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(after)
  })

  // ---- Live board ----------------------------------------------------------------------
  routes.get('/:runId/board', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const runId = String(uat.id)
    const [totals, features, tables, bugStats, recent] = await Promise.all([
      uatTotals(pool, runId),
      uatFeatures(pool, runId, { includeHidden: true }),
      listTables(pool, project.id, { runId }),
      selectOne<{ total: number; to_review: number; confirmations: number }>(
        pool,
        `SELECT
           SUM(d.duplicate_of_id IS NULL) AS total,
           SUM(d.duplicate_of_id IS NULL AND d.reviewed_at IS NULL AND u.auth_provider = 'WORKSHOP') AS to_review,
           (SELECT COUNT(*) FROM defect_confirmations dc JOIN workshop_tables wt2 ON wt2.user_id = dc.user_id
             WHERE wt2.run_id = ?) AS confirmations
           FROM defects d LEFT JOIN users u ON u.id = d.reported_by
          WHERE ${UAT_BUGS_WHERE}`,
        [runId, project.id, runId, runId],
      ),
      recentActivity(pool, runId),
    ])
    const board: WorkshopBoardDto = {
      uat: {
        ...uatRef(uat),
        is_public: Number(uat.is_public) === 1,
        public_fields: uatPublicFields(uat),
        public_intro: uat.public_intro,
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
        table_number: t.table_number,
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

  // ---- Public view of this UAT ---------------------------------------------------------
  routes.put('/:runId/public', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const input = await parseBody(c, cyclePublicSchema)
    // Problems are shown by Bug Reporting now; a UAT keeps its own fields only.
    const fields = normalizePublicFields(input.public_fields).filter((f) => !f.startsWith('bugs.'))
    await withTransaction(pool, async (conn) => {
      await execute(
        conn,
        'UPDATE test_runs SET is_public = ?, public_fields_json = ?, public_intro = ? WHERE id = ?',
        [input.is_public ? 1 : 0, JSON.stringify(fields), input.public_intro ?? null, uat.id],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: String(uat.id),
        action: 'UPDATE',
        oldValues: {
          is_public: Number(uat.is_public) === 1,
          public_fields: uatPublicFields(uat),
          public_intro: uat.public_intro,
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

  routes.put('/:runId/features', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const input = await parseBody(c, workshopFeatureStateSchema)
    const known = await selectOne(
      pool,
      'SELECT 1 FROM uat_features WHERE run_id = ? AND module_id = ?',
      [uat.id, input.module_id],
    )
    if (!known) throw invalid('module_id', 'Feature not in this UAT')
    await withTransaction(pool, async (conn) => {
      await execute(
        conn,
        'UPDATE uat_features SET state_code = ? WHERE run_id = ? AND module_id = ?',
        [input.state_code, uat.id, input.module_id],
      )
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'test_run',
        entityId: String(uat.id),
        action: 'UPDATE',
        newValues: { feature_module_id: input.module_id, state_code: input.state_code },
      })
    })
    return c.json(await uatFeatures(pool, String(uat.id), { includeHidden: true }))
  })

  // ---- Groups (kelompok / meja) --------------------------------------------------------
  routes.get('/:runId/groups', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    c.header('Cache-Control', 'no-store')
    return c.json(await listTables(pool, project.id, { runId: String(uat.id) }))
  })

  routes.post('/:runId/groups', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const cycleId = phaseOf(uat)
    const runId = String(uat.id)
    const input = await parseBody(c, workshopTableCreateSchema)
    const moduleIds = await assertModules(pool, project.id, input.module_ids)
    const tableId = await withTransaction(pool, async (conn) => {
      // The group signs in as its own account: no password, no e-mail login (ADR 0016).
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
               (project_id, cycle_id, run_id, user_id, name, table_number, access_code,
                valid_from, valid_until, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              project.id,
              cycleId,
              runId,
              insertedId(user),
              input.name,
              input.table_number ?? null,
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
            'SELECT 1 FROM workshop_tables WHERE run_id = ? AND name = ?',
            [runId, input.name],
          )
          if (sameName) throw duplicateName()
        }
      }
      if (!id) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Could not create the table card.')
      await setTableModules(conn, id, moduleIds)
      // People with an e-mail become User accounts right here (ADR 0018).
      await saveGroupMembers(conn, c, project.id, runId, id, input.members)
      await writeAudit(conn, c, {
        projectId: project.id,
        entityType: 'workshop_table',
        entityId: id,
        action: 'CREATE',
        newValues: {
          name: input.name,
          table_number: input.table_number ?? null,
          run_id: runId,
          module_ids: moduleIds,
          member_names: input.members.map((m) => m.name),
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until,
        },
      })
      return id
    })
    const [created] = await listTables(pool, project.id, { runId }, tableId)
    return c.json(created, 201)
  })

  routes.patch('/:runId/groups/:tableId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const runId = String(uat.id)
    const tableId = idParam(c, 'tableId')
    const input = await parseBody(c, workshopTableUpdateSchema)
    const moduleIds = input.module_ids
      ? await assertModules(pool, project.id, input.module_ids)
      : null
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<TableRow>(
        conn,
        'SELECT * FROM workshop_tables WHERE id = ? AND run_id = ? FOR UPDATE',
        [tableId, runId],
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
              SET name = ?, table_number = ?, access_code = ?, valid_from = ?, valid_until = ?,
                  revoked_at = CASE WHEN ? = 1 THEN COALESCE(revoked_at, UTC_TIMESTAMP(3))
                                    WHEN ? = 0 THEN NULL ELSE revoked_at END
            WHERE id = ?`,
          [
            input.name ?? before.name,
            input.table_number === undefined ? before.table_number : input.table_number,
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
      if (input.members) await saveGroupMembers(conn, c, project.id, runId, tableId, input.members)
      // A new code or a blocked card signs every device of this group out right away; a
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
          table_number: before.table_number,
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
    const [updated] = await listTables(pool, project.id, { runId }, tableId)
    return c.json(updated)
  })

  /** Remove a group that never answered anything; one with answers can only be blocked. */
  routes.delete('/:runId/groups/:tableId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const tableId = idParam(c, 'tableId')
    await withTransaction(pool, async (conn) => {
      const row = await selectOne<TableRow>(
        conn,
        'SELECT * FROM workshop_tables WHERE id = ? AND run_id = ? FOR UPDATE',
        [tableId, uat.id],
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
      // Its people stay in the UAT without a group (ON DELETE SET NULL); removing the account
      // removes the group, its features and its sessions (cascade).
      await execute(conn, 'DELETE FROM users WHERE id = ? AND auth_provider = ?', [
        row.user_id,
        'WORKSHOP',
      ])
    })
    return c.body(null, 204)
  })

  /** Everything a paper backup sheet for one group needs (cetak lembar cadangan). */
  routes.get('/:runId/groups/:tableId/sheet', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const [table] = await listTables(
      pool,
      project.id,
      { runId: String(uat.id) },
      idParam(c, 'tableId'),
    )
    if (!table) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const features: { module: ModuleRef; cases: Awaited<ReturnType<typeof featureCases>> }[] = []
    for (const module of table.modules) {
      features.push({ module, cases: await featureCases(pool, String(uat.id), module.id, null) })
    }
    return c.json({ table, features })
  })

  // ---- "Masalah masuk": problems from groups waiting for a facilitator -------------------
  routes.get('/:runId/inbox', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const runId = String(uat.id)
    const all = await uatBugRows(pool, project.id, runId)
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
        WHERE d.project_id = ? AND trc.test_run_id = ? AND d.reviewed_at IS NULL`,
      [project.id, runId],
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

  routes.post('/:runId/inbox/:defectId', requirePermission('run.write'), async (c) => {
    const project = c.get('project')
    const uat = await loadUat(pool, project.id, idParam(c, 'runId'))
    const runId = String(uat.id)
    const defectId = idParam(c, 'defectId')
    const input = await parseBody(c, defectReviewSchema)
    await reviewDefect(pool, c, project.id, defectId, input)
    const rows = await uatBugRows(pool, project.id, runId, {
      includeDuplicates: true,
      ids: [defectId],
    })
    const [bug] = await toWorkshopBugs(pool, rows, null)
    if (!bug) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    return c.json(bug)
  })

  return routes
}

/** One UAT as its page shows it (for a Pengguna: with their own group). */
export async function uatDetail(
  db: Db,
  projectId: string,
  runId: string,
  viewerId?: string,
): Promise<UatDetailDto> {
  const [summary] = await uatSummaries(db, projectId, { runId, onlyFor: viewerId })
  if (!summary) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  const { row, ...rest } = summary
  return {
    ...rest,
    environment_name: row.environment_name,
    build_version: row.build_version,
    public_fields: uatPublicFields(row),
    public_intro: row.public_intro,
    feature_list: await uatFeatures(db, runId, { includeHidden: true }),
  }
}

/**
 * Review a problem (Masalah masuk, and Bug Reporting's public reports): impact, priority,
 * reviewed, or "the same as" another problem of the project (it is then closed as a
 * duplicate and its scenarios point to the other one).
 */
export async function reviewDefect(
  pool: Pool,
  c: Parameters<typeof writeAudit>[1],
  projectId: string,
  defectId: string,
  input: ReturnType<typeof defectReviewSchema.parse>,
): Promise<void> {
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
      `SELECT id, bug_code, status_code, severity_code, priority_code, duplicate_of_id, reviewed_at
         FROM defects WHERE id = ? AND project_id = ? FOR UPDATE`,
      [defectId, projectId],
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
        'SELECT id, bug_code, duplicate_of_id FROM defects WHERE id = ? AND project_id = ?',
        [input.duplicate_of_id, projectId],
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
      projectId,
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
}

/** Last answers, problems and "+1" from the groups of this UAT (newest first). */
async function recentActivity(db: Db, runId: string): Promise<WorkshopBoardDto['recent']> {
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
        WHERE wt.run_id = ?
        ORDER BY e.tested_at DESC, e.id DESC LIMIT 15`,
      [runId],
    ),
    select<{ at: Date; table_name: string; tester_name: string | null; title: string }>(
      db,
      `SELECT d.created_at AS at, wt.name AS table_name, d.legacy_reporter_name AS tester_name,
              d.title
         FROM defects d JOIN workshop_tables wt ON wt.user_id = d.reported_by
        WHERE wt.run_id = ?
        ORDER BY d.created_at DESC, d.id DESC LIMIT 15`,
      [runId],
    ),
    select<{ at: Date; table_name: string; tester_name: string | null; title: string }>(
      db,
      `SELECT dc.created_at AS at, wt.name AS table_name, dc.tester_name, d.title
         FROM defect_confirmations dc
         JOIN workshop_tables wt ON wt.user_id = dc.user_id
         JOIN defects d ON d.id = dc.defect_id
        WHERE wt.run_id = ?
        ORDER BY dc.created_at DESC, dc.id DESC LIMIT 15`,
      [runId],
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
