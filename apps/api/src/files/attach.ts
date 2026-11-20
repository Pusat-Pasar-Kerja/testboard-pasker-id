import type { EvidenceRef } from '@testboard/shared'
import { execute, select, type Db } from '../db/tx.js'
import { AppError } from '../lib/errors.js'

const invalid = (message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
    { field: 'files', message },
  ])

/**
 * Only finished, clean, non-deleted files of this project can be attached (doc 06:
 * READY + CLEAN in the same project). The same file may be referenced by several owners
 * (e.g. an execution and the bug made from it) without copying the binary (doc 07).
 */
export async function assertAttachable(db: Db, projectId: string, refs: EvidenceRef[]) {
  const ids = [...new Set(refs.map((r) => r.file_id))]
  if (ids.length === 0) return
  const rows = await select<{ id: string; processing_status: string; scan_status: string }>(
    db,
    `SELECT id, processing_status, scan_status FROM file_objects
      WHERE project_id = ? AND deleted_at IS NULL AND id IN (${ids.map(() => '?').join(', ')})`,
    [projectId, ...ids],
  )
  if (rows.length !== ids.length) throw invalid('File not found in this project')
  if (rows.some((r) => r.processing_status !== 'READY' || r.scan_status !== 'CLEAN')) {
    throw invalid('File is not ready (still processing, rejected or failed)')
  }
}

const TABLES = {
  execution: { table: 'execution_files', column: 'execution_id', step: true, sort: true },
  defect: { table: 'defect_files', column: 'defect_id', step: false, sort: true },
  test_case: { table: 'test_case_files', column: 'test_case_id', step: false, sort: false },
} as const

/** Insert links (existing links are kept as they are). Returns how many were new. */
export async function linkFiles(
  db: Db,
  owner: keyof typeof TABLES,
  ownerId: string,
  refs: EvidenceRef[],
): Promise<number> {
  const t = TABLES[owner]
  const [{ next } = { next: 0 }] = t.sort
    ? await select<{ next: number }>(
        db,
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM ${t.table} WHERE ${t.column} = ?`,
        [ownerId],
      )
    : [{ next: 0 }]
  let added = 0
  let order = Number(next)
  const seen = new Set<string>()
  for (const ref of refs) {
    if (seen.has(ref.file_id)) continue
    seen.add(ref.file_id)
    const columns = [t.column, 'file_object_id', 'caption']
    const values: unknown[] = [ownerId, ref.file_id, ref.caption ?? null]
    if (t.step) {
      columns.push('step_number')
      values.push(ref.step_number ?? null)
    }
    if (t.sort) {
      columns.push('sort_order')
      values.push(order++)
    }
    const result = await execute(
      db,
      `INSERT IGNORE INTO ${t.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values,
    )
    added += result.affectedRows
  }
  return added
}

export async function unlinkFile(
  db: Db,
  owner: keyof typeof TABLES,
  ownerId: string,
  fileId: string,
): Promise<boolean> {
  const t = TABLES[owner]
  const result = await execute(
    db,
    `DELETE FROM ${t.table} WHERE ${t.column} = ? AND file_object_id = ?`,
    [ownerId, fileId],
  )
  return result.affectedRows > 0
}
