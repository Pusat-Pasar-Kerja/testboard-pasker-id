import {
  importedDescription,
  planDefectRows,
  type DefectImportConfig,
  type DefectImportResult,
  type DefectImportValues,
  type ImportImage,
  type PreparedDefectRow,
} from '@testboard/shared'
import type { Context } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { execute, insertedId, select, selectOne, withTransaction, type Db } from '../db/tx.js'
import type { FileService } from '../files/pipeline.js'
import { writeAudit } from '../lib/audit.js'
import { nextBugCode } from '../routes/defects-write.js'
import type { AppEnv } from '../types.js'
import type { ImportStore, ParsedSource } from './analyze.js'
import { openImportMedia, saveImportImage, type CommitJob } from './service.js'

/**
 * "Impor Bug" (ADR 0013): bugs from a tracker workbook. Planning is shared with the demo
 * (@testboard/shared planDefectRows); this file reads the project state and writes.
 */
export async function prepareDefectImport(
  db: Db,
  projectId: string,
  parsed: ParsedSource,
  config: DefectImportConfig,
) {
  const [codes, modules] = await Promise.all([
    select<{ bug_code: string }>(db, 'SELECT bug_code FROM defects WHERE project_id = ?', [
      projectId,
    ]),
    select<{ module_code: string }>(db, 'SELECT module_code FROM modules WHERE project_id = ?', [
      projectId,
    ]),
  ])
  return planDefectRows(
    parsed.sheets,
    config,
    new Set(codes.map((r) => r.bug_code.toUpperCase())),
    new Set(modules.map((m) => m.module_code)),
  )
}

export async function saveDefectRows(
  conn: PoolConnection,
  jobId: string,
  rows: PreparedDefectRow[],
) {
  await execute(conn, 'DELETE FROM import_job_rows WHERE import_job_id = ?', [jobId])
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    await execute(
      conn,
      `INSERT INTO import_job_rows
         (import_job_id, sheet_name, source_row_number, external_case_code, source_hash,
          raw_payload_json, mapped_payload_json, status_code, validation_errors_json)
       VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      chunk.flatMap((r) => [
        jobId,
        r.sheet.slice(0, 255),
        r.row,
        (r.values.bug_code ?? r.values.case_code)?.slice(0, 100) ?? null,
        createHash('sha256').update(r.fingerprint).digest('hex'),
        JSON.stringify(r.raw),
        JSON.stringify({
          values: r.values,
          labels: r.labels,
          action: r.action,
          duplicate_of: r.duplicate_of,
          images: r.images,
        }),
        r.status,
        JSON.stringify(r.issues),
      ]),
    )
  }
}

const asJson = <T>(value: unknown): T =>
  (typeof value === 'string' ? JSON.parse(value) : value) as T

/** Latest attempt of the test case (by code) in the chosen cycle, failed ones first. */
async function attemptFor(
  conn: PoolConnection,
  projectId: string,
  caseCode: string,
  cycleId: string | null,
) {
  const row = await selectOne<{ id: string }>(
    conn,
    `SELECT e.id FROM test_executions e
       JOIN test_run_cases trc ON trc.id = e.run_case_id
       JOIN test_runs r ON r.id = trc.test_run_id
       JOIN test_cases tc ON tc.id = trc.test_case_id
      WHERE r.project_id = ? AND tc.case_code = ? AND (? IS NULL OR r.cycle_id = ?)
      ORDER BY e.result_status = 'FAILED' DESC, e.tested_at DESC, e.id DESC
      LIMIT 1`,
    [projectId, caseCode, cycleId, cycleId],
  )
  return row ? String(row.id) : null
}

const CLOSED = new Set(['CLOSED', 'WONT_FIX'])
const RESOLVED = new Set(['FIXED', 'READY_FOR_RETEST', 'VERIFIED', 'CLOSED'])

/**
 * Apply a previewed bug import. Bugs, modules, history, comments and result links are
 * written in ONE transaction (TB-IMP-007); screenshots then go through the evidence
 * pipeline and are attached to their bug.
 */
export async function commitDefectImport(
  pool: Pool,
  files: FileService,
  store: ImportStore,
  job: CommitJob,
  config: DefectImportConfig,
  c: Context<AppEnv>,
) {
  const summary: DefectImportResult = {
    created_defects: 0,
    skipped_rows: 0,
    linked_results: 0,
    images_imported: 0,
    images_failed: 0,
    images_left_out: 0,
  }
  const stored = await select<{
    id: string
    sheet_name: string
    source_row_number: number
    status_code: string
    mapped_payload_json: unknown
  }>(
    pool,
    `SELECT id, sheet_name, source_row_number, status_code, mapped_payload_json
       FROM import_job_rows WHERE import_job_id = ? ORDER BY id`,
    [job.id],
  )
  const preview = await store.readJson<{ images: ImportImage[] }>(job.id, 'preview')
  const imageByKey = new Map((preview?.images ?? []).map((i) => [i.key, i]))
  const defectForRow = new Map<string, string>()

  await withTransaction(pool, async (conn) => {
    const project = await selectOne<{ project_code: string }>(
      conn,
      'SELECT project_code FROM projects WHERE id = ? FOR UPDATE',
      [job.projectId],
    )
    const cycle = config.cycle_id
      ? await selectOne<{ id: string }>(
          conn,
          'SELECT id FROM test_cycles WHERE id = ? AND project_id = ?',
          [config.cycle_id, job.projectId],
        )
      : null
    const cycleId = cycle ? String(cycle.id) : null
    const modules = new Map(
      (
        await select<{ id: string; module_code: string }>(
          conn,
          'SELECT id, module_code FROM modules WHERE project_id = ?',
          [job.projectId],
        )
      ).map((m) => [m.module_code, String(m.id)]),
    )
    const moduleId = async (code: string | null, sheet: string) => {
      if (!code) return null
      const known = modules.get(code)
      if (known) return known
      const result = await execute(
        conn,
        'INSERT INTO modules (project_id, module_code, name) VALUES (?, ?, ?)',
        [job.projectId, code, sheet.slice(0, 200)],
      )
      modules.set(code, insertedId(result))
      return insertedId(result)
    }
    const taken = new Set(
      (
        await select<{ bug_code: string }>(
          conn,
          'SELECT bug_code FROM defects WHERE project_id = ?',
          [job.projectId],
        )
      ).map((r) => r.bug_code.toUpperCase()),
    )

    for (const row of stored) {
      if (row.status_code !== 'VALID') {
        summary.skipped_rows++
        continue
      }
      const { values } = asJson<{ values: DefectImportValues }>(row.mapped_payload_json)
      const code =
        values.bug_code && !taken.has(values.bug_code)
          ? values.bug_code
          : await nextBugCode(conn, job.projectId, project?.project_code ?? 'PRJ')
      taken.add(code)
      const reference = [
        job.filename,
        row.sheet_name,
        `baris ${row.source_row_number}`,
        values.case_code,
      ]
        .filter(Boolean)
        .join(' / ')
        .slice(0, 255)
      const result = await execute(
        conn,
        `INSERT INTO defects
           (project_id, module_id, cycle_id, bug_code, title, description, severity_code,
            priority_code, status_code, source_kind, source_reference, reported_by,
            legacy_reporter_name, reported_at, resolved_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          job.projectId,
          await moduleId(values.module_code, row.sheet_name),
          cycleId,
          code,
          values.title,
          importedDescription(values),
          values.severity,
          values.priority,
          values.status,
          values.source_kind,
          reference,
          values.reporter_name,
          values.reported_at ? new Date(`${values.reported_at.slice(0, 10)}T00:00:00Z`) : null,
          RESOLVED.has(values.status) ? new Date() : null,
          CLOSED.has(values.status) ? new Date() : null,
        ],
      )
      const defectId = insertedId(result)
      defectForRow.set(String(row.id), defectId)
      await execute(
        conn,
        `INSERT INTO defect_status_history (defect_id, from_status, to_status, changed_by, change_comment)
         VALUES (?, NULL, ?, ?, ?)`,
        [defectId, values.status, job.createdBy, `Diimpor dari ${job.filename}`.slice(0, 1000)],
      )
      if (values.notes) {
        await execute(
          conn,
          'INSERT INTO defect_comments (defect_id, author_id, body) VALUES (?, ?, ?)',
          [defectId, job.createdBy, `Catatan dari file: ${values.notes}`.slice(0, 20_000)],
        )
      }
      if (config.link_results && values.case_code) {
        const executionId = await attemptFor(conn, job.projectId, values.case_code, cycleId)
        if (executionId) {
          await execute(
            conn,
            'INSERT INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
            [defectId, executionId],
          )
          summary.linked_results++
        }
      }
      await execute(conn, "UPDATE import_job_rows SET status_code = 'IMPORTED' WHERE id = ?", [
        row.id,
      ])
      summary.created_defects++
    }
    await writeAudit(conn, c, {
      projectId: job.projectId,
      entityType: 'import_job',
      entityId: job.id,
      action: 'IMPORT',
      newValues: { filename: job.filename, target: 'DEFECTS', ...summary },
    })
  })

  // Embedded screenshots -> evidence of the imported bugs.
  const media = await openImportMedia(store, job, defectForRow.size > 0)
  let linked = 0
  for (const row of stored) {
    const defectId = defectForRow.get(String(row.id))
    const keys = asJson<{ images?: string[] }>(row.mapped_payload_json).images ?? []
    if (!defectId || !media || keys.length === 0) continue
    let order = 0
    for (const key of keys) {
      const image = imageByKey.get(key)
      const fileId = image ? await saveImportImage(pool, files, job, media, image) : null
      if (!fileId || !image) {
        summary.images_failed++
        continue
      }
      await execute(
        pool,
        'INSERT INTO defect_files (defect_id, file_object_id, caption, sort_order) VALUES (?, ?, ?, ?)',
        [defectId, fileId, `Bukti ${image.anchor}`, ++order],
      )
      await execute(
        pool,
        'INSERT INTO import_job_row_files (import_job_row_id, file_object_id, source_anchor) VALUES (?, ?, ?)',
        [row.id, fileId, `${image.sheet}!${image.anchor}`.slice(0, 100)],
      )
      linked++
    }
  }
  summary.images_imported = linked
  summary.images_left_out = Math.max(0, imageByKey.size - linked - summary.images_failed)
  return summary
}
