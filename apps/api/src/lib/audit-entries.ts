import {
  auditChanges,
  auditLabel,
  auditRefIds,
  auditRefKey,
  auditSnapshotLabel,
  type AuditLogEntry,
  type AuditRefKind,
} from '@testboard/shared'
import { iso, parseJson, select, type Db } from '../db/tx.js'

/** One audit_logs row as both activity-log routes read it. */
export interface AuditLogRow {
  id: string
  created_at: Date
  actor_id: string | null
  display_name: string | null
  entity_type: string
  entity_id: string
  action_code: string
  old_values_json: unknown
  new_values_json: unknown
  request_id: string | null
  /** Site-wide log only. */
  project_id?: string | null
  project_code?: string | null
}

interface LabelRow {
  id: string
  code: string | null
  name: string | null
}

/**
 * Name lookups by entity type. `scope` is the table alias that carries project_id, so the
 * project log only ever names records of its own project; null = not project data.
 */
const ENTITY_SQL: Record<string, { sql: string; scope: string | null }> = {
  defect: {
    sql: 'SELECT d.id, d.bug_code AS code, d.title AS name FROM defects d WHERE d.id IN (?)',
    scope: 'd',
  },
  defect_comment: {
    sql: `SELECT c.id, d.bug_code AS code, d.title AS name
            FROM defect_comments c JOIN defects d ON d.id = c.defect_id WHERE c.id IN (?)`,
    scope: 'd',
  },
  test_case: {
    sql: 'SELECT t.id, t.case_code AS code, LEFT(t.title, 200) AS name FROM test_cases t WHERE t.id IN (?)',
    scope: 't',
  },
  test_run: {
    sql: 'SELECT r.id, r.run_code AS code, r.name FROM test_runs r WHERE r.id IN (?)',
    scope: 'r',
  },
  test_execution: {
    sql: `SELECT e.id, tc.case_code AS code, r.run_code AS name
            FROM test_executions e
            JOIN test_run_cases rc ON rc.id = e.run_case_id
            JOIN test_runs r ON r.id = rc.test_run_id
            JOIN test_cases tc ON tc.id = rc.test_case_id
           WHERE e.id IN (?)`,
    scope: 'r',
  },
  test_cycle: {
    sql: 'SELECT c.id, c.cycle_code AS code, c.title AS name FROM test_cycles c WHERE c.id IN (?)',
    scope: 'c',
  },
  test_suite: {
    sql: 'SELECT s.id, NULL AS code, s.name FROM test_suites s WHERE s.id IN (?)',
    scope: 's',
  },
  module: {
    sql: 'SELECT m.id, m.module_code AS code, m.name FROM modules m WHERE m.id IN (?)',
    scope: 'm',
  },
  file: {
    sql: 'SELECT f.id, NULL AS code, f.original_filename AS name FROM file_objects f WHERE f.id IN (?)',
    scope: 'f',
  },
  import_job: {
    sql: 'SELECT j.id, NULL AS code, j.original_filename AS name FROM import_jobs j WHERE j.id IN (?)',
    scope: 'j',
  },
  workshop_table: {
    sql: 'SELECT w.id, NULL AS code, w.name FROM workshop_tables w WHERE w.id IN (?)',
    scope: 'w',
  },
  project: {
    sql: 'SELECT p.id, p.project_code AS code, p.name FROM projects p WHERE p.id IN (?)',
    scope: null,
  },
  project_member: {
    sql: 'SELECT u.id, NULL AS code, u.display_name AS name FROM users u WHERE u.id IN (?)',
    scope: null,
  },
  user: {
    sql: 'SELECT u.id, NULL AS code, u.display_name AS name FROM users u WHERE u.id IN (?)',
    scope: null,
  },
  reset_link: {
    sql: `SELECT l.id, NULL AS code, u.display_name AS name
            FROM password_reset_links l JOIN users u ON u.id = l.user_id WHERE l.id IN (?)`,
    scope: null,
  },
  recovery_request: {
    sql: 'SELECT r.id, NULL AS code, r.submitted_name AS name FROM account_recovery_requests r WHERE r.id IN (?)',
    scope: null,
  },
}

/** Name lookups for ids inside snapshots (AUDIT_REF_FIELDS kinds). */
const REF_SQL: Record<AuditRefKind, { sql: string; scope: string | null }> = {
  user: ENTITY_SQL.user!,
  cycle: ENTITY_SQL.test_cycle!,
  module: ENTITY_SQL.module!,
  suite: ENTITY_SQL.test_suite!,
  run: ENTITY_SQL.test_run!,
  defect: {
    sql: 'SELECT d.id, d.bug_code AS code, NULL AS name FROM defects d WHERE d.id IN (?)',
    scope: 'd',
  },
  case: {
    sql: 'SELECT t.id, t.case_code AS code, NULL AS name FROM test_cases t WHERE t.id IN (?)',
    scope: 't',
  },
}

async function labels(
  db: Db,
  lookup: { sql: string; scope: string | null },
  ids: string[],
  projectId: string | null,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const scoped = projectId !== null && lookup.scope !== null
  const rows = await select<LabelRow>(
    db,
    scoped ? `${lookup.sql} AND ${lookup.scope}.project_id = ?` : lookup.sql,
    scoped ? [ids, projectId] : [ids],
  )
  const out = new Map<string, string>()
  for (const row of rows) {
    const label = auditLabel(row.code, row.name)
    if (label) out.set(String(row.id), label)
  }
  return out
}

/**
 * Turns audit rows into log entries that name things: the record each entry is about
 * (entity_label) and the records behind ids in its changes (refs). `projectId` limits the
 * lookups to one project (project log); null for the website-wide log.
 */
export async function auditEntries(
  db: Db,
  rows: AuditLogRow[],
  projectId: string | null,
): Promise<AuditLogEntry[]> {
  const parsed = rows.map((row) => {
    const oldValues = parseJson(row.old_values_json)
    const newValues = parseJson(row.new_values_json)
    return { row, oldValues, newValues, changes: auditChanges(oldValues, newValues) }
  })

  const byType = new Map<string, Set<string>>()
  for (const { row } of parsed) {
    if (!ENTITY_SQL[row.entity_type]) continue
    const set = byType.get(row.entity_type) ?? new Set<string>()
    set.add(String(row.entity_id))
    byType.set(row.entity_type, set)
  }
  const entityNames = new Map<string, Map<string, string>>()
  for (const [type, ids] of byType) {
    entityNames.set(type, await labels(db, ENTITY_SQL[type]!, [...ids], projectId))
  }

  const refIds = new Map<AuditRefKind, Set<string>>()
  for (const { changes } of parsed) {
    for (const [kind, ids] of auditRefIds(changes)) {
      const set = refIds.get(kind) ?? new Set<string>()
      ids.forEach((id) => set.add(id))
      refIds.set(kind, set)
    }
  }
  const refNames = new Map<AuditRefKind, Map<string, string>>()
  for (const [kind, ids] of refIds) {
    refNames.set(kind, await labels(db, REF_SQL[kind], [...ids], projectId))
  }

  return parsed.map(({ row, oldValues, newValues, changes }) => {
    const refs: Record<string, string> = {}
    for (const [kind, ids] of auditRefIds(changes)) {
      for (const id of ids) {
        const name = refNames.get(kind)?.get(id)
        if (name) refs[auditRefKey(kind, id)] = name
      }
    }
    const entry: AuditLogEntry = {
      id: String(row.id),
      created_at: iso(row.created_at) as string,
      actor: row.actor_id
        ? { id: String(row.actor_id), display_name: row.display_name ?? '' }
        : null,
      entity_type: row.entity_type,
      entity_id: String(row.entity_id),
      entity_label:
        entityNames.get(row.entity_type)?.get(String(row.entity_id)) ??
        auditSnapshotLabel(oldValues, newValues),
      action_code: row.action_code,
      changes,
      refs,
      request_id: row.request_id,
    }
    if (row.project_id !== undefined) {
      entry.project = row.project_id
        ? { id: String(row.project_id), project_code: row.project_code ?? '' }
        : null
    }
    return entry
  })
}
