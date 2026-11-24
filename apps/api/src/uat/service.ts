import {
  countResult,
  emptyCounts,
  normalizePublicFields,
  type ExecutionStatus,
  type PublicField,
  type ResultCounts,
  type RunStatus,
  type TableMember,
  type UatFeatureAssignmentDto,
  type UatParticipantDto,
  type UatRef,
  type UatSummaryDto,
  type WorkshopFeatureDto,
  type WorkshopFeatureState,
} from '@testboard/shared'
import type { Context } from 'hono'
import type { PoolConnection } from 'mysql2/promise'
import { ensureProjectTask, findOrCreatePerson } from '../access/people.js'
import { execute, iso, parseJson, select, selectOne, type Db } from '../db/tx.js'
import { AppError } from '../lib/errors.js'
import { snapshotOf } from '../routes/runs-write.js'
import type { AppEnv, ProjectAccess } from '../types.js'
import { memberAccount } from '../workshop/service.js'

/**
 * UAT (ADR 0019): one testing event for one Fase, stored as a test run. It has the features
 * chosen for it (uat_features), its participants (workshop_table_members with run_id; a
 * group is a workshop table) and its own public view. A Pengguna only reaches the UATs they
 * take part in; Admins and Super Admins reach every UAT.
 */

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ')

export interface UatRow {
  id: string
  project_id: string
  cycle_id: string | null
  run_code: string
  name: string
  status_code: RunStatus
  starts_at: Date | null
  ends_at: Date | null
  environment_name: string | null
  build_version: string | null
  is_public: number
  public_fields_json: unknown
  public_intro: string | null
  cycle_code: string | null
  cycle_title: string | null
}

const UAT_SELECT = `
  SELECT r.id, r.project_id, r.cycle_id, r.run_code, r.name, r.status_code, r.starts_at, r.ends_at,
         r.environment_name, r.build_version, r.is_public, r.public_fields_json, r.public_intro,
         c.cycle_code, c.title AS cycle_title
    FROM test_runs r LEFT JOIN test_cycles c ON c.id = r.cycle_id`

export async function loadUat(db: Db, projectId: string, runId: string): Promise<UatRow> {
  const row = await selectOne<UatRow>(db, `${UAT_SELECT} WHERE r.id = ? AND r.project_id = ?`, [
    runId,
    projectId,
  ])
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

export function uatRef(row: UatRow): UatRef {
  return {
    id: String(row.id),
    name: row.name,
    run_code: row.run_code,
    status_code: row.status_code,
    phase: row.cycle_id
      ? { id: String(row.cycle_id), cycle_code: row.cycle_code ?? '', title: row.cycle_title ?? '' }
      : null,
  }
}

export function uatPublicFields(row: Pick<UatRow, 'public_fields_json'>): PublicField[] {
  const value = parseJson<unknown>(row.public_fields_json)
  return normalizePublicFields(Array.isArray(value) ? value.map(String) : [])
}

/** Admins (website role, or a legacy lead row) manage; everyone else takes part. */
export const managesProject = (project: ProjectAccess) =>
  project.role === 'ADMIN' || project.role === 'QA_LEAD'

/**
 * Taking part in a UAT: listed as a participant, or given scenarios of it the old way
 * (assigned run cases; migration 0015 turned those into participants, and an Admin may still
 * assign scenarios to a person).
 */
const TAKES_PART = `(
     EXISTS (SELECT 1 FROM workshop_table_members m WHERE m.run_id = r.id AND m.user_id = ?)
     OR EXISTS (SELECT 1 FROM test_run_cases a WHERE a.test_run_id = r.id AND a.assigned_to = ?))`

/** The UATs a person takes part in, inside one project. */
export async function myUatIds(db: Db, projectId: string, userId: string): Promise<Set<string>> {
  const rows = await select<{ id: string }>(
    db,
    `SELECT r.id FROM test_runs r WHERE r.project_id = ? AND ${TAKES_PART}`,
    [projectId, userId, userId],
  )
  return new Set(rows.map((r) => String(r.id)))
}

/**
 * A Pengguna may only open a UAT they take part in; anything else answers 404 like a
 * missing UAT (no existence leak, TB-RBAC-002).
 */
export async function assertUatAccess(c: Context<AppEnv>, db: Db, runId: string): Promise<void> {
  const project = c.get('project')
  if (managesProject(project)) return
  const userId = c.get('auth')?.userId
  const row = userId
    ? await selectOne(
        db,
        `SELECT 1 FROM test_runs r WHERE r.id = ? AND r.project_id = ? AND ${TAKES_PART}`,
        [runId, project.id, userId, userId],
      )
    : null
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
}

/** The UAT a run case belongs to, for the same check on scenario-level routes. */
export async function assertRunCaseAccess(
  c: Context<AppEnv>,
  db: Db,
  runCaseId: string,
): Promise<void> {
  const project = c.get('project')
  if (managesProject(project)) return
  const row = await selectOne<{ test_run_id: string }>(
    db,
    `SELECT trc.test_run_id FROM test_run_cases trc JOIN test_runs r ON r.id = trc.test_run_id
      WHERE trc.id = ? AND r.project_id = ?`,
    [runCaseId, project.id],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  await assertUatAccess(c, db, String(row.test_run_id))
}

/**
 * The features a participant row (alias `m`) works on: those of their group, and those
 * assigned to them by name (ADR 0020). Only these scenarios are theirs.
 */
export const MEMBER_MODULES = (m: string) => `(
  SELECT module_id FROM workshop_table_modules WHERE table_id = ${m}.table_id
  UNION SELECT module_id FROM uat_feature_people WHERE member_id = ${m}.id)`

/**
 * Recording a result: a Pengguna may answer the scenarios of the features they are listed for
 * in that UAT - through their group or by name (owner, 2026-11-24) - and scenarios assigned to
 * them. Someone in the UAT without any assignment has nothing to answer yet.
 */
export async function assertParticipantCase(
  c: Context<AppEnv>,
  db: Db,
  runCaseId: string,
): Promise<void> {
  const project = c.get('project')
  if (managesProject(project)) return
  const userId = c.get('auth')?.userId ?? null
  const row = await selectOne(
    db,
    `SELECT 1 FROM test_run_cases trc
       JOIN test_cases tc ON tc.id = trc.test_case_id
       JOIN test_runs r ON r.id = trc.test_run_id AND r.project_id = ?
      WHERE trc.id = ?
        AND (trc.assigned_to = ?
             OR EXISTS (SELECT 1 FROM workshop_table_members m
                         WHERE m.run_id = trc.test_run_id AND m.user_id = ?
                           AND tc.module_id IN ${MEMBER_MODULES('m')}))
      LIMIT 1`,
    [project.id, runCaseId, userId, userId],
  )
  if (!row) throw new AppError(403, 'FORBIDDEN', 'This scenario is not assigned to you.')
}

// ---- Features and progress ----------------------------------------------------------------

/** The features chosen for a UAT, with their public state and the progress of their scenarios. */
export async function uatFeatures(
  db: Db,
  runId: string,
  options: { includeHidden: boolean },
): Promise<WorkshopFeatureDto[]> {
  const features = await select<{
    module_id: string
    module_code: string
    name: string
    state_code: WorkshopFeatureState
  }>(
    db,
    `SELECT m.id AS module_id, m.module_code, m.name, f.state_code
       FROM uat_features f JOIN modules m ON m.id = f.module_id
      WHERE f.run_id = ?
      ORDER BY m.name`,
    [runId],
  )
  const counts = await select<{ module_id: string; latest_status: ExecutionStatus; n: number }>(
    db,
    `SELECT tc.module_id, v.latest_status, COUNT(*) AS n
       FROM v_run_case_latest_status v JOIN test_cases tc ON tc.id = v.test_case_id
      WHERE v.test_run_id = ?
      GROUP BY tc.module_id, v.latest_status`,
    [runId],
  )
  return features
    .map((f) => {
      const progress = emptyCounts()
      for (const row of counts) {
        if (String(row.module_id) === String(f.module_id)) {
          countResult(progress, row.latest_status, Number(row.n))
        }
      }
      return {
        module: { id: String(f.module_id), module_code: f.module_code, name: f.name },
        state: f.state_code,
        progress,
      }
    })
    .filter((f) => options.includeHidden || f.state !== 'HIDDEN')
    .sort((a, b) => a.module.name.localeCompare(b.module.name, 'id'))
}

export async function uatTotals(db: Db, runId: string): Promise<ResultCounts> {
  const rows = await select<{ latest_status: ExecutionStatus; n: number }>(
    db,
    `SELECT latest_status, COUNT(*) AS n FROM v_run_case_latest_status
      WHERE test_run_id = ? GROUP BY latest_status`,
    [runId],
  )
  const totals = emptyCounts()
  for (const row of rows) countResult(totals, row.latest_status, Number(row.n))
  return totals
}

/**
 * Bring an open UAT up to date with its Fase: every Ready scenario of its features that is
 * not in it yet is added (frozen as a snapshot, like adding to a run by hand). A finished or
 * locked UAT never changes. Returns how many scenarios were added.
 */
export async function syncUatCases(conn: PoolConnection, runId: string): Promise<number> {
  const run = await selectOne<{ id: string; cycle_id: string | null; status_code: RunStatus }>(
    conn,
    'SELECT id, cycle_id, status_code FROM test_runs WHERE id = ? FOR UPDATE',
    [runId],
  )
  if (!run || !run.cycle_id || !['PLANNED', 'ACTIVE'].includes(run.status_code)) return 0
  const cases = await select<Parameters<typeof snapshotOf>[0]>(
    conn,
    `SELECT tc.*, m.module_code FROM test_cases tc
       JOIN modules m ON m.id = tc.module_id
       JOIN uat_features f ON f.module_id = tc.module_id AND f.run_id = ?
      WHERE tc.cycle_id = ? AND tc.case_status = 'READY'
        AND NOT EXISTS (SELECT 1 FROM test_run_cases trc
                         WHERE trc.test_run_id = ? AND trc.test_case_id = tc.id)
      ORDER BY m.name, tc.case_code`,
    [runId, run.cycle_id, runId],
  )
  if (cases.length === 0) return 0
  const max = await selectOne<{ m: number | null }>(
    conn,
    'SELECT MAX(sort_order) AS m FROM test_run_cases WHERE test_run_id = ?',
    [runId],
  )
  let order = Number(max?.m ?? 0)
  for (const row of cases) {
    order += 1
    await execute(
      conn,
      `INSERT INTO test_run_cases
         (test_run_id, test_case_id, assigned_to, case_version, case_snapshot_json, sort_order)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [runId, row.id, row.current_version, JSON.stringify(snapshotOf(row)), order],
    )
  }
  return cases.length
}

/** After scenarios of a Fase change: every open UAT of that Fase follows. */
export async function syncPhaseUats(
  conn: PoolConnection,
  projectId: string,
  cycleId: string | null,
): Promise<void> {
  if (!cycleId) return
  const runs = await select<{ id: string }>(
    conn,
    `SELECT id FROM test_runs
      WHERE project_id = ? AND cycle_id = ? AND status_code IN ('PLANNED', 'ACTIVE')`,
    [projectId, cycleId],
  )
  for (const run of runs) await syncUatCases(conn, String(run.id))
}

/**
 * The features of a UAT: kept features keep their state, removed ones take their untried
 * scenarios with them (scenarios with results always stay), new ones bring their scenarios.
 */
export async function setUatFeatures(
  conn: PoolConnection,
  runId: string,
  moduleIds: string[],
): Promise<void> {
  const wanted = [...new Set(moduleIds)]
  if (wanted.length > 0) {
    await execute(
      conn,
      `DELETE FROM uat_features WHERE run_id = ? AND module_id NOT IN (${placeholders(wanted.length)})`,
      [runId, ...wanted],
    )
  } else {
    await execute(conn, 'DELETE FROM uat_features WHERE run_id = ?', [runId])
  }
  for (const moduleId of wanted) {
    await execute(
      conn,
      'INSERT IGNORE INTO uat_features (run_id, module_id, state_code) VALUES (?, ?, ?)',
      [runId, moduleId, 'OPEN'],
    )
  }
  // Assignments of features that left the UAT go with them (ADR 0020).
  await execute(
    conn,
    `DELETE tm FROM workshop_table_modules tm
       JOIN workshop_tables t ON t.id = tm.table_id
      WHERE t.run_id = ?
        AND tm.module_id NOT IN (SELECT module_id FROM uat_features WHERE run_id = ?)`,
    [runId, runId],
  )
  await execute(
    conn,
    `DELETE fp FROM uat_feature_people fp
       JOIN workshop_table_members m ON m.id = fp.member_id
      WHERE m.run_id = ?
        AND fp.module_id NOT IN (SELECT module_id FROM uat_features WHERE run_id = ?)`,
    [runId, runId],
  )
  await execute(
    conn,
    `DELETE trc FROM test_run_cases trc
       JOIN test_cases tc ON tc.id = trc.test_case_id
      WHERE trc.test_run_id = ?
        AND (tc.module_id IS NULL OR tc.module_id NOT IN
             (SELECT module_id FROM uat_features WHERE run_id = ?))
        AND NOT EXISTS (SELECT 1 FROM test_executions e WHERE e.run_case_id = trc.id)`,
    [runId, runId],
  )
  await syncUatCases(conn, runId)
}

// ---- Summaries --------------------------------------------------------------------------

export async function uatSummaries(
  db: Db,
  projectId: string,
  options: { runId?: string; onlyFor?: string } = {},
): Promise<(UatSummaryDto & { row: UatRow })[]> {
  const only = options.onlyFor ? await myUatIds(db, projectId, options.onlyFor) : null
  if (only && only.size === 0) return []
  const rows = (
    await select<UatRow>(
      db,
      `${UAT_SELECT}
        WHERE r.project_id = ? AND (? IS NULL OR r.id = ?)
        ORDER BY FIELD(r.status_code, 'ACTIVE', 'PLANNED', 'COMPLETED', 'LOCKED'),
                 r.starts_at DESC, r.id DESC`,
      [projectId, options.runId ?? null, options.runId ?? null],
    )
  ).filter((row) => !only || only.has(String(row.id)))
  const ids = rows.map((r) => String(r.id))
  if (ids.length === 0) return []
  const [tallies, featureCounts, groupCounts, peopleCounts, myGroups] = await Promise.all([
    select<{ test_run_id: string; latest_status: ExecutionStatus; n: number }>(
      db,
      `SELECT test_run_id, latest_status, COUNT(*) AS n FROM v_run_case_latest_status
        WHERE test_run_id IN (${placeholders(ids.length)})
        GROUP BY test_run_id, latest_status`,
      ids,
    ),
    select<{ run_id: string; n: number }>(
      db,
      `SELECT run_id, COUNT(*) AS n FROM uat_features
        WHERE run_id IN (${placeholders(ids.length)}) GROUP BY run_id`,
      ids,
    ),
    select<{ run_id: string; n: number }>(
      db,
      `SELECT run_id, COUNT(*) AS n FROM workshop_tables
        WHERE run_id IN (${placeholders(ids.length)}) GROUP BY run_id`,
      ids,
    ),
    select<{ run_id: string; n: number }>(
      db,
      `SELECT run_id, COUNT(*) AS n FROM workshop_table_members
        WHERE run_id IN (${placeholders(ids.length)}) GROUP BY run_id`,
      ids,
    ),
    options.onlyFor
      ? select<{ run_id: string; id: string; name: string; table_number: number | null }>(
          db,
          `SELECT m.run_id, t.id, t.name, t.table_number
             FROM workshop_table_members m JOIN workshop_tables t ON t.id = m.table_id
            WHERE m.user_id = ? AND m.run_id IN (${placeholders(ids.length)})`,
          [options.onlyFor, ...ids],
        )
      : Promise.resolve([]),
  ])
  const countOf = (list: { run_id: string; n: number }[], id: string) =>
    Number(list.find((r) => String(r.run_id) === id)?.n ?? 0)
  // A Pengguna's own features: through their group or by name (ADR 0020).
  const myFeatures = options.onlyFor
    ? await select<{ run_id: string; id: string; module_code: string; name: string }>(
        db,
        `SELECT DISTINCT m.run_id, md.id, md.module_code, md.name
           FROM workshop_table_members m
           JOIN modules md ON md.id IN ${MEMBER_MODULES('m')}
          WHERE m.user_id = ? AND m.run_id IN (${placeholders(ids.length)})
          ORDER BY md.name`,
        [options.onlyFor, ...ids],
      )
    : []
  // The features of a Pengguna's own groups: the scenarios they may try (ADR 0019).
  const groupModules =
    myGroups.length > 0
      ? await select<{ table_id: string; id: string; module_code: string; name: string }>(
          db,
          `SELECT tm.table_id, m.id, m.module_code, m.name
             FROM workshop_table_modules tm JOIN modules m ON m.id = tm.module_id
            WHERE tm.table_id IN (${placeholders(myGroups.length)})
            ORDER BY m.name`,
          myGroups.map((g) => g.id),
        )
      : []
  return rows.map((row) => {
    const id = String(row.id)
    const progress = emptyCounts()
    for (const t of tallies) {
      if (String(t.test_run_id) === id) countResult(progress, t.latest_status, Number(t.n))
    }
    const group = myGroups.find((g) => String(g.run_id) === id)
    return {
      row,
      ...uatRef(row),
      starts_at: iso(row.starts_at),
      ends_at: iso(row.ends_at),
      is_public: Number(row.is_public) === 1,
      features: countOf(featureCounts, id),
      groups: countOf(groupCounts, id),
      participants: countOf(peopleCounts, id),
      progress,
      ...(options.onlyFor
        ? {
            my_group: group
              ? {
                  id: String(group.id),
                  name: group.name,
                  table_number: group.table_number === null ? null : Number(group.table_number),
                  modules: groupModules
                    .filter((m) => String(m.table_id) === String(group.id))
                    .map((m) => ({ id: String(m.id), module_code: m.module_code, name: m.name })),
                }
              : null,
            my_features: myFeatures
              .filter((m) => String(m.run_id) === id)
              .map((m) => ({ id: String(m.id), module_code: m.module_code, name: m.name })),
          }
        : {}),
    }
  })
}

// ---- Participants -------------------------------------------------------------------------

interface ParticipantRow {
  id: string
  run_id: string | null
  table_id: string | null
  sort_order: number
  display_name: string
  user_id: string | null
  email: string | null
  has_password: number | null
  group_name: string | null
  table_number: number | null
}

export async function participantRows(db: Db, runId: string): Promise<ParticipantRow[]> {
  return select<ParticipantRow>(
    db,
    `SELECT m.id, m.run_id, m.table_id, m.sort_order, m.display_name, m.user_id, u.email,
            u.password_hash IS NOT NULL AS has_password,
            t.name AS group_name, t.table_number
       FROM workshop_table_members m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN workshop_tables t ON t.id = m.table_id
      WHERE m.run_id = ?
      ORDER BY t.table_number IS NULL, t.table_number, t.name, m.sort_order, m.display_name`,
    [runId],
  )
}

export function participantDto(row: ParticipantRow): UatParticipantDto {
  return {
    id: String(row.id),
    name: row.display_name,
    email: row.email,
    user_id: row.user_id === null ? null : String(row.user_id),
    account: memberAccount({ ...row, table_id: row.table_id ?? '' }),
    group: row.table_id
      ? {
          id: String(row.table_id),
          name: row.group_name ?? '',
          table_number: row.table_number === null ? null : Number(row.table_number),
        }
      : null,
  }
}

async function assertGroupOfUat(db: Db, runId: string, groupId: string | null | undefined) {
  if (!groupId) return
  const row = await selectOne(db, 'SELECT 1 FROM workshop_tables WHERE id = ? AND run_id = ?', [
    groupId,
    runId,
  ])
  if (!row) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'group_id', message: 'Group not found in this UAT' },
    ])
  }
}

/**
 * Put one person into a UAT (and a group): matched by their account when an e-mail is given,
 * otherwise by name. Someone already in the UAT is moved, never added twice.
 */
export async function placeParticipant(
  conn: PoolConnection,
  c: Context<AppEnv>,
  projectId: string,
  runId: string,
  person: { name: string; email?: string | null; group_id?: string | null },
  sortOrder = 0,
): Promise<string> {
  await assertGroupOfUat(conn, runId, person.group_id)
  const name = person.name.trim().slice(0, 100)
  let userId: string | null = null
  if (person.email) {
    const found = await findOrCreatePerson(conn, c, { email: person.email, display_name: name })
    await ensureProjectTask(conn, c, projectId, found.userId)
    userId = found.userId
  }
  const existing = userId
    ? await selectOne<{ id: string }>(
        conn,
        'SELECT id FROM workshop_table_members WHERE run_id = ? AND user_id = ?',
        [runId, userId],
      )
    : await selectOne<{ id: string }>(
        conn,
        `SELECT id FROM workshop_table_members
          WHERE run_id = ? AND user_id IS NULL AND LOWER(display_name) = LOWER(?)`,
        [runId, name],
      )
  if (existing) {
    // Listed again without a group (the participant form): they keep the group they are in.
    const moves = person.group_id !== undefined
    await execute(
      conn,
      `UPDATE workshop_table_members
          SET table_id = CASE WHEN ? = 1 THEN ? ELSE table_id END,
              sort_order = CASE WHEN ? = 1 THEN ? ELSE sort_order END,
              display_name = CASE WHEN user_id IS NULL THEN ? ELSE display_name END
        WHERE id = ?`,
      [moves ? 1 : 0, person.group_id ?? null, moves ? 1 : 0, sortOrder, name, existing.id],
    )
    return String(existing.id)
  }
  const result = await execute(
    conn,
    `INSERT INTO workshop_table_members (run_id, table_id, sort_order, display_name, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, person.group_id ?? null, sortOrder, name, userId],
  )
  return String(result.insertId)
}

/**
 * The people of one group, as an Admin lists them on the group form: listed people are put
 * in the group (added to the UAT when new); people who were in it and are no longer listed
 * stay in the UAT without a group.
 */
export async function saveGroupMembers(
  conn: PoolConnection,
  c: Context<AppEnv>,
  projectId: string,
  runId: string,
  tableId: string,
  members: TableMember[],
): Promise<void> {
  const kept: string[] = []
  for (const [index, member] of members.entries()) {
    kept.push(
      await placeParticipant(
        conn,
        c,
        projectId,
        runId,
        { name: member.name, email: member.email ?? null, group_id: tableId },
        index,
      ),
    )
  }
  await execute(
    conn,
    `UPDATE workshop_table_members SET table_id = NULL
      WHERE table_id = ? ${kept.length ? `AND id NOT IN (${placeholders(kept.length)})` : ''}`,
    [tableId, ...kept],
  )
}

// ---- Feature assignments (ADR 0020) -----------------------------------------------------------

const groupRef = (row: { id: string; name: string; table_number: number | null }) => ({
  id: String(row.id),
  name: row.name,
  table_number: row.table_number === null ? null : Number(row.table_number),
})

/**
 * Who works on each feature of a UAT (owner, 2026-11-24): its groups (their table cards) and
 * the people assigned by name. Only those listed answer the feature's scenarios.
 */
export async function featureAssignments(
  db: Db,
  runId: string,
  onlyModuleId?: string,
): Promise<UatFeatureAssignmentDto[]> {
  const [features, groups, people] = await Promise.all([
    select<{ id: string; module_code: string; name: string }>(
      db,
      `SELECT m.id, m.module_code, m.name
         FROM uat_features f JOIN modules m ON m.id = f.module_id
        WHERE f.run_id = ? AND (? IS NULL OR m.id = ?)
        ORDER BY m.name`,
      [runId, onlyModuleId ?? null, onlyModuleId ?? null],
    ),
    select<{ module_id: string; id: string; name: string; table_number: number | null }>(
      db,
      `SELECT tm.module_id, t.id, t.name, t.table_number
         FROM workshop_table_modules tm JOIN workshop_tables t ON t.id = tm.table_id
        WHERE t.run_id = ?
        ORDER BY t.table_number IS NULL, t.table_number, t.name`,
      [runId],
    ),
    select<{
      module_id: string
      id: string
      display_name: string
      user_id: string | null
      table_id: string | null
      group_name: string | null
      table_number: number | null
    }>(
      db,
      `SELECT fp.module_id, m.id, m.display_name, m.user_id, t.id AS table_id,
              t.name AS group_name, t.table_number
         FROM uat_feature_people fp
         JOIN workshop_table_members m ON m.id = fp.member_id
         LEFT JOIN workshop_tables t ON t.id = m.table_id
        WHERE m.run_id = ?
        ORDER BY m.display_name`,
      [runId],
    ),
  ])
  return features.map((feature) => {
    const id = String(feature.id)
    return {
      module: { id, module_code: feature.module_code, name: feature.name },
      groups: groups.filter((g) => String(g.module_id) === id).map(groupRef),
      people: people
        .filter((p) => String(p.module_id) === id)
        .map((p) => ({
          id: String(p.id),
          name: p.display_name,
          user_id: p.user_id === null ? null : String(p.user_id),
          group:
            p.table_id === null
              ? null
              : groupRef({
                  id: p.table_id,
                  name: p.group_name ?? '',
                  table_number: p.table_number,
                }),
        })),
    }
  })
}

/**
 * Replace who works on one feature of a UAT: groups get the feature on their card (the same
 * list as on the group form), people are assigned by name. Anyone left out no longer works on
 * it; results already recorded always stay.
 */
export async function setFeatureAssignees(
  conn: PoolConnection,
  runId: string,
  moduleId: string,
  input: { group_ids: string[]; member_ids: string[] },
): Promise<void> {
  const feature = await selectOne(
    conn,
    'SELECT 1 FROM uat_features WHERE run_id = ? AND module_id = ?',
    [runId, moduleId],
  )
  if (!feature) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'module_id', message: 'This feature is not part of the UAT' },
    ])
  }
  const groupIds = [...new Set(input.group_ids)]
  const memberIds = [...new Set(input.member_ids)]
  if (groupIds.length > 0) {
    const found = await select<{ id: string }>(
      conn,
      `SELECT id FROM workshop_tables WHERE run_id = ? AND id IN (${placeholders(groupIds.length)})`,
      [runId, ...groupIds],
    )
    if (found.length !== groupIds.length) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'group_ids', message: 'Group not found in this UAT' },
      ])
    }
  }
  if (memberIds.length > 0) {
    const found = await select<{ id: string }>(
      conn,
      `SELECT id FROM workshop_table_members
        WHERE run_id = ? AND id IN (${placeholders(memberIds.length)})`,
      [runId, ...memberIds],
    )
    if (found.length !== memberIds.length) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'member_ids', message: 'Person not found in this UAT' },
      ])
    }
  }
  await execute(
    conn,
    `DELETE tm FROM workshop_table_modules tm
       JOIN workshop_tables t ON t.id = tm.table_id
      WHERE t.run_id = ? AND tm.module_id = ?
        ${groupIds.length ? `AND tm.table_id NOT IN (${placeholders(groupIds.length)})` : ''}`,
    [runId, moduleId, ...groupIds],
  )
  for (const tableId of groupIds) {
    await execute(
      conn,
      'INSERT IGNORE INTO workshop_table_modules (table_id, module_id) VALUES (?, ?)',
      [tableId, moduleId],
    )
  }
  await execute(
    conn,
    `DELETE fp FROM uat_feature_people fp
       JOIN workshop_table_members m ON m.id = fp.member_id
      WHERE m.run_id = ? AND fp.module_id = ?
        ${memberIds.length ? `AND fp.member_id NOT IN (${placeholders(memberIds.length)})` : ''}`,
    [runId, moduleId, ...memberIds],
  )
  for (const memberId of memberIds) {
    await execute(
      conn,
      'INSERT IGNORE INTO uat_feature_people (member_id, module_id) VALUES (?, ?)',
      [memberId, moduleId],
    )
  }
}
