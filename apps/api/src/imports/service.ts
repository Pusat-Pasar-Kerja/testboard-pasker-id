import {
  caseFingerprint,
  checkCaseRow,
  isDataRow,
  mapRow,
  normalizeResultStatus,
  parseLegacyDate,
  RECORDABLE_RESULTS,
  type CheckedCase,
  type ExecutionStatus,
  type ImportConfig,
  type ImportImage,
  type ImportIssue,
  type ImportPreview,
  type ImportResultSummary,
  type ImportSourceFormat,
  type ImportSourceKind,
  type RecordableResult,
} from '@testboard/shared'
import type { Context } from 'hono'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { execute, insertedId, isDuplicateKey, select, withTransaction, type Db } from '../db/tx.js'
import type { FileService } from '../files/pipeline.js'
import { sniff } from '../files/sniff.js'
import { BUCKET, STORAGE_BACKEND } from '../files/storage.js'
import { writeAudit } from '../lib/audit.js'
import { nextRunCode, snapshotOf } from '../routes/runs-write.js'
import { insertRevision, loadCase, nextCaseCode } from '../routes/test-cases.js'
import type { AppEnv } from '../types.js'
import type { ImportStore, ParsedSource } from './analyze.js'
import { extractZipEntry, readZipEntries } from '../files/zip.js'
import { columnName } from './xlsx.js'

export interface PreparedResult {
  label: string | null
  status: ExecutionStatus | 'IGNORE' | null
  actual_result: string | null
  notes: string | null
  tester_name: string | null
  tested_at: string | null
}

export interface PreparedRow {
  sheet: string
  row: number
  status: 'VALID' | 'ERROR' | 'DUPLICATE'
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null
  values: CheckedCase
  result: PreparedResult
  issues: ImportIssue[]
  raw: Record<string, string>
  duplicate_of: string | null
  target_id: string | null
  images: string[]
  hash: string
}

interface ExistingCase {
  id: string
  case_status: string
  values: CheckedCase
}

const CASE_COLUMNS = [
  'category',
  'title',
  'requirement_refs',
  'priority_code',
  'test_type_code',
  'actor_label',
  'preconditions',
  'test_steps_text',
  'expected_result',
] as const

/** UPDATE merges non-empty imported values; NEW_REVISION replaces the whole definition. */
export function mergeForMode(
  existing: CheckedCase,
  imported: CheckedCase,
  mode: ImportConfig['import_mode'],
): CheckedCase {
  if (mode !== 'UPDATE') return { ...imported, case_code: existing.case_code }
  const merged = { ...existing }
  for (const key of Object.keys(imported) as (keyof CheckedCase)[]) {
    const value = imported[key]
    if (value !== null && value !== '' && key !== 'case_code')
      (merged as Record<string, unknown>)[key] = value
  }
  return merged
}

async function existingCases(db: Db, projectId: string, codes: string[]) {
  const found = new Map<string, ExistingCase>()
  for (let i = 0; i < codes.length; i += 500) {
    const chunk = codes.slice(i, i + 500)
    const rows = await select<Record<string, string | number | null>>(
      db,
      `SELECT tc.id, tc.case_code, tc.case_status, m.module_code, s.name AS suite_name, tc.sequence_number,
              tc.category, tc.title, tc.requirement_refs, tc.priority_code, tc.test_type_code,
              tc.actor_label, tc.preconditions, tc.test_steps_text, tc.expected_result, tc.source_locale
         FROM test_cases tc
         LEFT JOIN modules m ON m.id = tc.module_id
         LEFT JOIN test_suites s ON s.id = tc.suite_id
        WHERE tc.project_id = ? AND tc.case_code IN (${chunk.map(() => '?').join(', ')})`,
      [projectId, ...chunk],
    )
    for (const r of rows) {
      found.set(String(r.case_code), {
        id: String(r.id),
        case_status: String(r.case_status),
        values: {
          case_code: String(r.case_code),
          module_code: (r.module_code as string) ?? null,
          suite_name: (r.suite_name as string) ?? null,
          sequence_number: r.sequence_number === null ? null : Number(r.sequence_number),
          category: (r.category as string) ?? null,
          title: String(r.title),
          requirement_refs: (r.requirement_refs as string) ?? null,
          priority_code: r.priority_code as CheckedCase['priority_code'],
          test_type_code: r.test_type_code as CheckedCase['test_type_code'],
          actor_label: (r.actor_label as string) ?? null,
          preconditions: (r.preconditions as string) ?? null,
          test_steps_text: (r.test_steps_text as string) ?? null,
          expected_result: String(r.expected_result ?? ''),
          source_locale: r.source_locale === 'en' ? 'en' : 'id',
          source_document: null,
        },
      })
    }
  }
  return found
}

/**
 * Map + validate every selected row, find duplicates (in the file and in the project)
 * and decide what a commit would do. Nothing is written to test cases here.
 */
export async function prepareImport(
  db: Db,
  projectId: string,
  parsed: ParsedSource,
  config: ImportConfig,
) {
  const rows: PreparedRow[] = []
  const images: ImportImage[] = []
  for (const sheetConfig of config.sheets) {
    const sheet = parsed.sheets.find((s) => s.name === sheetConfig.name)
    if (!sheet) throw new Error(`SHEET_NOT_FOUND:${sheetConfig.name}`)
    const headers = sheet.rows[sheetConfig.header_row - 1] ?? []
    const hidden = new Set(sheet.hiddenRows)
    const sheetRows = new Set<number>()
    sheet.rows.slice(sheetConfig.header_row).forEach((cells, index) => {
      const rowNumber = sheetConfig.header_row + index + 1
      const mapped = mapRow(headers, cells, sheetConfig.mapping, {
        module_code: sheetConfig.module_code || undefined,
        suite_name: sheetConfig.suite_name || parsed.suite_name || undefined,
        source_locale: parsed.source_locale,
      })
      if (!isDataRow(mapped)) return
      sheetRows.add(rowNumber)
      const checked = checkCaseRow(mapped)
      const issues = [...checked.issues]
      if (hidden.has(rowNumber)) issues.push({ level: 'warning', code: 'HIDDEN_ROW' })
      const result: PreparedResult = {
        label: mapped.result.result_status ?? null,
        status: null,
        actual_result: mapped.result.actual_result ?? null,
        notes: mapped.result.notes ?? null,
        tester_name: mapped.result.tester_name?.slice(0, 255) ?? null,
        tested_at: null,
      }
      if (config.include_results) {
        if (result.label) {
          result.status = config.status_map?.[result.label] ?? normalizeResultStatus(result.label)
          if (result.status === null) {
            issues.push({
              field: 'result_status',
              level: 'warning',
              code: 'UNKNOWN_STATUS',
              value: result.label,
            })
          } else if (result.status === 'IN_PROGRESS') {
            issues.push({
              field: 'result_status',
              level: 'warning',
              code: 'NOT_RECORDABLE',
              value: result.label,
            })
          }
        }
        if (mapped.result.tested_at) {
          result.tested_at = parseLegacyDate(mapped.result.tested_at)
          if (!result.tested_at) {
            issues.push({
              field: 'tested_at',
              level: 'warning',
              code: 'BAD_DATE',
              value: mapped.result.tested_at,
            })
          }
        }
      }
      rows.push({
        sheet: sheet.name,
        row: rowNumber,
        status: issues.some((i) => i.level === 'error') ? 'ERROR' : 'VALID',
        action: null,
        values: checked.values,
        result,
        issues,
        raw: mapped.raw,
        duplicate_of: null,
        target_id: null,
        images: [],
        hash: createHash('sha256').update(caseFingerprint(checked.values)).digest('hex'),
      })
    })

    // Images belong to the row they are anchored in; never matched by file order (doc 08 F).
    for (const image of sheet.images) {
      const override = config.image_rows?.[image.key]
      const anchor = `${columnName(image.col)}${image.row}`
      if (override === null) {
        images.push({
          key: image.key,
          sheet: sheet.name,
          anchor,
          row_number: null,
          state: 'IGNORED',
        })
      } else if (override !== undefined && sheetRows.has(override)) {
        images.push({
          key: image.key,
          sheet: sheet.name,
          anchor,
          row_number: override,
          state: 'ASSIGNED',
        })
      } else if (sheetRows.has(image.row)) {
        images.push({
          key: image.key,
          sheet: sheet.name,
          anchor,
          row_number: image.row,
          state: 'AUTO',
        })
      } else {
        images.push({
          key: image.key,
          sheet: sheet.name,
          anchor,
          row_number: null,
          state: 'REVIEW',
        })
      }
    }
  }

  // Same code twice in the file: the first row wins, later ones are reported (TB-IMP-004).
  const firstByCode = new Map<string, PreparedRow>()
  for (const row of rows) {
    const code = row.values.case_code
    if (!code || row.status === 'ERROR') continue
    const first = firstByCode.get(code)
    if (first) {
      row.status = 'DUPLICATE'
      row.duplicate_of = `${first.sheet}!${first.row}`
    } else firstByCode.set(code, row)
  }

  const existing = await existingCases(db, projectId, [...firstByCode.keys()])
  for (const row of rows) {
    if (row.status !== 'VALID') continue
    const found = row.values.case_code ? existing.get(row.values.case_code) : undefined
    if (!found) {
      row.action = 'CREATE'
      continue
    }
    row.target_id = found.id
    if (found.case_status === 'ARCHIVED') {
      row.status = 'ERROR'
      row.issues.push({ field: 'case_code', level: 'error', code: 'ARCHIVED_CASE' })
    } else if (config.import_mode === 'CREATE_ONLY') {
      if (config.include_results) {
        // Re-using the existing case for its historical result; the definition is kept.
        row.action = 'UNCHANGED'
        row.issues.push({ field: 'case_code', level: 'warning', code: 'EXISTING_CASE_KEPT' })
      } else {
        row.status = 'DUPLICATE'
        row.duplicate_of = 'EXISTING'
      }
    } else {
      const merged = mergeForMode(found.values, row.values, config.import_mode)
      row.action =
        caseFingerprint(merged) === caseFingerprint(found.values) ? 'UNCHANGED' : 'UPDATE'
    }
  }

  for (const image of images) {
    if (image.row_number === null) continue
    rows.find((r) => r.sheet === image.sheet && r.row === image.row_number)?.images.push(image.key)
  }

  const moduleRows = await select<{ module_code: string }>(
    db,
    'SELECT module_code FROM modules WHERE project_id = ?',
    [projectId],
  )
  const knownModules = new Set(moduleRows.map((m) => m.module_code))
  const suiteRows = await select<{ name: string; module_code: string | null }>(
    db,
    `SELECT s.name, m.module_code FROM test_suites s LEFT JOIN modules m ON m.id = s.module_id WHERE s.project_id = ?`,
    [projectId],
  )
  const knownSuites = new Set(suiteRows.map((s) => `${s.module_code ?? ''}|${s.name}`))
  const valid = rows.filter((r) => r.status === 'VALID')
  const newModules = [...new Set(valid.map((r) => r.values.module_code as string))].filter(
    (m) => !knownModules.has(m),
  )
  const newSuites = [
    ...new Set(
      valid
        .filter((r) => r.values.suite_name)
        .map((r) => `${r.values.module_code}|${r.values.suite_name}`),
    ),
  ].filter((key) => !knownSuites.has(key))

  const labels = new Map<string, number>()
  for (const row of rows)
    if (row.result.label) labels.set(row.result.label, (labels.get(row.result.label) ?? 0) + 1)

  const preview: ImportPreview = {
    counts: {
      total: rows.length,
      valid: valid.filter((r) => !r.issues.length).length,
      review: valid.filter((r) => r.issues.length > 0).length,
      duplicate: rows.filter((r) => r.status === 'DUPLICATE').length,
      invalid: rows.filter((r) => r.status === 'ERROR').length,
      create: valid.filter((r) => r.action === 'CREATE').length,
      update: valid.filter((r) => r.action === 'UPDATE').length,
      unchanged: valid.filter((r) => r.action === 'UNCHANGED').length,
    },
    statuses: config.include_results
      ? [...labels].map(([label, count]) => ({
          label,
          count,
          mapped: config.status_map?.[label] ?? normalizeResultStatus(label),
        }))
      : [],
    new_modules: newModules,
    new_suites: newSuites.map((key) => key.split('|')[1] as string),
    images: {
      total: images.length,
      auto: images.filter((i) => i.state === 'AUTO' || i.state === 'ASSIGNED').length,
      review: images.filter((i) => i.state === 'REVIEW'),
    },
  }
  return { rows, preview, images }
}

export async function saveRows(conn: PoolConnection, jobId: string, rows: PreparedRow[]) {
  await execute(conn, 'DELETE FROM import_job_rows WHERE import_job_id = ?', [jobId])
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    await execute(
      conn,
      `INSERT INTO import_job_rows
         (import_job_id, sheet_name, source_row_number, external_case_code, source_hash,
          raw_payload_json, mapped_payload_json, status_code, validation_errors_json, target_test_case_id)
       VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      chunk.flatMap((r) => [
        jobId,
        r.sheet.slice(0, 255),
        r.row,
        r.values.case_code,
        r.hash,
        JSON.stringify(r.raw),
        JSON.stringify({
          values: r.values,
          result: r.result,
          action: r.action,
          duplicate_of: r.duplicate_of,
          images: r.images,
        }),
        r.status,
        JSON.stringify(r.issues),
        r.target_id,
      ]),
    )
  }
}

export interface CommitJob {
  id: string
  projectId: string
  filename: string
  format: ImportSourceFormat
  kind: ImportSourceKind
  createdBy: string | null
}

interface StoredRow {
  id: string
  sheet_name: string
  source_row_number: number
  status_code: string
  mapped_payload_json: unknown
}

const asJson = <T>(value: unknown): T =>
  (typeof value === 'string' ? JSON.parse(value) : value) as T

const IMAGE_EXT: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' }

/**
 * Apply a previewed import (runs in the background). Cases, run and results are written
 * in ONE transaction - a failure leaves nothing half-imported (TB-IMP-007). Embedded
 * screenshots then go through the normal evidence pipeline and are linked when clean.
 */
export async function commitImport(
  pool: Pool,
  files: FileService,
  store: ImportStore,
  job: CommitJob,
  config: ImportConfig,
  c: Context<AppEnv>,
) {
  const summary: ImportResultSummary = {
    created_cases: 0,
    updated_cases: 0,
    unchanged_cases: 0,
    skipped_rows: 0,
    run: null,
    executions: 0,
    images_imported: 0,
    images_failed: 0,
    images_left_out: 0,
  }
  const stored = await select<StoredRow>(
    pool,
    'SELECT id, sheet_name, source_row_number, status_code, mapped_payload_json FROM import_job_rows WHERE import_job_id = ? ORDER BY id',
    [job.id],
  )
  const preview = await store.readJson<{ images: ImportImage[] }>(job.id, 'preview')
  const imageByKey = new Map((preview?.images ?? []).map((i) => [i.key, i]))
  const executionForRow = new Map<string, string>()
  let rowErrors = 0

  await withTransaction(pool, async (conn) => {
    await execute(conn, 'SELECT id FROM projects WHERE id = ? FOR UPDATE', [job.projectId])
    const sourceKind =
      job.kind === 'AI' ? 'AI_IMPORT' : job.kind === 'LEGACY' ? 'LEGACY_IMPORT' : 'MANUAL'
    const caseStatus = config.include_results ? 'READY' : config.case_status
    const modules = new Map(
      (
        await select<{ id: string; module_code: string }>(
          conn,
          'SELECT id, module_code FROM modules WHERE project_id = ?',
          [job.projectId],
        )
      ).map((m) => [m.module_code, String(m.id)]),
    )
    const suites = new Map(
      (
        await select<{ id: string; name: string; module_id: string | null }>(
          conn,
          'SELECT id, name, module_id FROM test_suites WHERE project_id = ?',
          [job.projectId],
        )
      ).map((s) => [`${s.module_id ?? ''}|${s.name}`, String(s.id)]),
    )
    const sheetOf = new Map(config.sheets.map((s) => [s.name, s]))

    const moduleId = async (code: string, sheet: string) => {
      const known = modules.get(code)
      if (known) return known
      const name = sheetOf.get(sheet)?.suite_name || code
      const result = await execute(
        conn,
        'INSERT INTO modules (project_id, module_code, name) VALUES (?, ?, ?)',
        [job.projectId, code, name.slice(0, 200)],
      )
      modules.set(code, insertedId(result))
      return insertedId(result)
    }
    const suiteId = async (name: string | null, mod: string, sheet: string) => {
      if (!name) return null
      const key = `${mod}|${name}`
      const known = suites.get(key)
      if (known) return known
      const s = sheetOf.get(sheet)
      const result = await execute(
        conn,
        `INSERT INTO test_suites (project_id, module_id, name, reference_document, reference_version, source_notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          job.projectId,
          mod,
          name,
          s?.reference_document ?? null,
          s?.reference_version ?? null,
          `Diimpor dari ${job.filename}`.slice(0, 1000),
          job.createdBy,
        ],
      )
      suites.set(key, insertedId(result))
      return insertedId(result)
    }

    const caseIds = new Map<string, string>()
    for (const row of stored) {
      const mapped = asJson<{
        values: CheckedCase
        result: PreparedResult
        action: PreparedRow['action']
      }>(row.mapped_payload_json)
      if (row.status_code === 'DUPLICATE') {
        await execute(conn, "UPDATE import_job_rows SET status_code = 'SKIPPED' WHERE id = ?", [
          row.id,
        ])
        summary.skipped_rows++
        continue
      }
      if (row.status_code !== 'VALID') continue
      const v = mapped.values
      const where = `${row.sheet_name}!${row.source_row_number}`
      const mod = await moduleId(v.module_code as string, row.sheet_name)
      const suite = await suiteId(v.suite_name, mod, row.sheet_name)
      let caseId: string | null
      let changed = false

      if (mapped.action === 'CREATE') {
        const code = v.case_code ?? (await nextCaseCode(conn, job.projectId, v.module_code))
        try {
          const result = await execute(
            conn,
            `INSERT INTO test_cases
               (project_id, module_id, suite_id, case_code, sequence_number, category, title,
                requirement_refs, priority_code, test_type_code, actor_label, preconditions,
                test_steps_text, expected_result, source_locale, case_status, source_kind,
                current_version, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              job.projectId,
              mod,
              suite,
              code,
              v.sequence_number,
              v.category,
              v.title,
              v.requirement_refs,
              v.priority_code,
              v.test_type_code,
              v.actor_label,
              v.preconditions,
              v.test_steps_text,
              v.expected_result,
              v.source_locale,
              caseStatus,
              sourceKind,
              job.createdBy,
              job.createdBy,
            ],
          )
          caseId = insertedId(result)
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
          // Created by someone else after the preview: report the row, keep the rest.
          rowErrors++
          await execute(
            conn,
            "UPDATE import_job_rows SET status_code = 'ERROR', validation_errors_json = ? WHERE id = ?",
            [JSON.stringify([{ field: 'case_code', level: 'error', code: 'CODE_TAKEN' }]), row.id],
          )
          continue
        }
        await insertRevision(
          conn,
          await loadCase(conn, job.projectId, caseId),
          job.createdBy,
          `Imported: ${job.filename} (${where})`,
        )
        summary.created_cases++
        changed = true
      } else {
        const targetRows = await select<{ target_test_case_id: string }>(
          conn,
          'SELECT target_test_case_id FROM import_job_rows WHERE id = ?',
          [row.id],
        )
        caseId = targetRows[0]?.target_test_case_id
          ? String(targetRows[0].target_test_case_id)
          : null
        if (!caseId) continue
        const before = await loadCase(conn, job.projectId, caseId, true)
        if (mapped.action === 'UPDATE') {
          const existing = {
            module_id: before.module_id,
            suite_id: before.suite_id,
            sequence_number: before.sequence_number,
            ...Object.fromEntries(CASE_COLUMNS.map((col) => [col, before[col]])),
          } as Record<string, unknown>
          const next: Record<string, unknown> = { module_id: mod, suite_id: suite }
          for (const col of [...CASE_COLUMNS, 'sequence_number'] as const) {
            const value = v[col]
            next[col] =
              config.import_mode === 'UPDATE' && (value === null || value === '')
                ? existing[col]
                : value
          }
          if (config.include_results && before.case_status === 'DRAFT') next.case_status = 'READY'
          const cols = Object.keys(next).filter(
            (col) =>
              String(next[col] ?? '') !==
              String((before as unknown as Record<string, unknown>)[col] ?? ''),
          )
          if (cols.length > 0) {
            await execute(
              conn,
              `UPDATE test_cases SET ${cols.map((col) => `${col} = ?`).join(', ')}, current_version = current_version + 1, updated_by = ? WHERE id = ?`,
              [...cols.map((col) => next[col]), job.createdBy, caseId],
            )
            await insertRevision(
              conn,
              await loadCase(conn, job.projectId, caseId),
              job.createdBy,
              `Import ${config.import_mode === 'UPDATE' ? 'update' : 'new revision'}: ${job.filename} (${where})`,
            )
            summary.updated_cases++
            changed = true
          } else summary.unchanged_cases++
        } else {
          if (config.include_results && before.case_status === 'DRAFT') {
            await execute(
              conn,
              "UPDATE test_cases SET case_status = 'READY', current_version = current_version + 1, updated_by = ? WHERE id = ?",
              [job.createdBy, caseId],
            )
            await insertRevision(
              conn,
              await loadCase(conn, job.projectId, caseId),
              job.createdBy,
              `Status DRAFT -> READY (import ${job.filename})`,
            )
          }
          summary.unchanged_cases++
        }
      }
      caseIds.set(row.id, caseId)
      const contributes = changed || (config.include_results && caseId !== null)
      await execute(
        conn,
        'UPDATE import_job_rows SET status_code = ?, target_test_case_id = ? WHERE id = ?',
        [contributes ? 'IMPORTED' : 'SKIPPED', caseId, row.id],
      )
      if (!contributes) summary.skipped_rows++
    }

    if (config.include_results && config.run && caseIds.size > 0) {
      const runCode = await nextRunCode(conn, job.projectId)
      const dates = stored
        .map((r) => asJson<{ result: PreparedResult }>(r.mapped_payload_json).result.tested_at)
        .filter((d): d is string => Boolean(d))
        .sort()
      const runResult = await execute(
        conn,
        `INSERT INTO test_runs (project_id, cycle_id, run_code, name, environment_name, build_version, status_code, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?)`,
        [
          job.projectId,
          config.run.cycle_id ?? null,
          runCode,
          config.run.name,
          config.run.environment_name ?? null,
          config.run.build_version ?? null,
          dates[0] ? new Date(`${dates[0].slice(0, 10)}T00:00:00Z`) : new Date(),
          dates.at(-1)
            ? new Date(`${(dates.at(-1) as string).slice(0, 10)}T00:00:00Z`)
            : new Date(),
          job.createdBy,
        ],
      )
      const runId = insertedId(runResult)
      summary.run = { id: runId, run_code: runCode }
      const inRun = new Set<string>()
      let order = 0
      for (const row of stored) {
        const caseId = caseIds.get(row.id)
        if (!caseId || inRun.has(caseId)) continue
        inRun.add(caseId)
        const caseRow = await loadCase(conn, job.projectId, caseId)
        const rc = await execute(
          conn,
          `INSERT INTO test_run_cases (test_run_id, test_case_id, case_version, case_snapshot_json, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [runId, caseId, caseRow.current_version, JSON.stringify(snapshotOf(caseRow)), ++order],
        )
        const result = asJson<{ result: PreparedResult }>(row.mapped_payload_json).result
        if (result.status && (RECORDABLE_RESULTS as readonly string[]).includes(result.status)) {
          const exec = await execute(
            conn,
            `INSERT INTO test_executions (run_case_id, attempt_number, execution_kind, result_status, actual_result, notes,
                                          tester_id, legacy_tester_name, tested_at)
             VALUES (?, 1, 'INITIAL', ?, ?, ?, NULL, ?, ?)`,
            [
              insertedId(rc),
              result.status as RecordableResult,
              result.actual_result,
              result.notes,
              result.tester_name,
              result.tested_at ? new Date(`${result.tested_at.slice(0, 10)}T00:00:00Z`) : null,
            ],
          )
          executionForRow.set(row.id, insertedId(exec))
          summary.executions++
        }
      }
    }

    await writeAudit(conn, c, {
      projectId: job.projectId,
      entityType: 'import_job',
      entityId: job.id,
      action: 'IMPORT',
      newValues: { filename: job.filename, mode: config.import_mode, ...summary },
    })
  })

  // Embedded screenshots -> evidence of the migrated attempts (results mode only).
  const rowImages = new Map<string, string[]>()
  for (const row of stored) {
    const mapped = asJson<{ images?: string[] }>(row.mapped_payload_json)
    if (mapped.images?.length) rowImages.set(row.id, mapped.images)
  }
  const totalImages = preview?.images.length ?? 0
  // Media come straight from the stored package using the cached anchors (no re-parse).
  const sourceBytes =
    job.format === 'XLSX' && executionForRow.size > 0
      ? await store.readSource(job.id, 'XLSX')
      : null
  const zipEntries = sourceBytes ? (readZipEntries(sourceBytes) ?? []) : []
  const parsedCache = sourceBytes ? await store.readJson<ParsedSource>(job.id, 'parsed') : null
  const mediaOf = new Map<string, string>()
  for (const sheet of parsedCache?.sheets ?? []) {
    for (const image of sheet.images) mediaOf.set(image.key, image.media)
  }
  const readMedia = (path: string) => {
    const entry = zipEntries.find((e) => e.name === path)
    if (!entry || !sourceBytes || entry.uncompressedSize > 30 * 1024 * 1024) return null
    return extractZipEntry(sourceBytes, entry)
  }
  let linked = 0
  for (const [rowId, keys] of rowImages) {
    const executionId = executionForRow.get(rowId)
    if (!executionId || !sourceBytes) continue
    let order = 0
    for (const key of keys) {
      const media = mediaOf.get(key)
      const image = imageByKey.get(key)
      const ext = IMAGE_EXT[(media ?? '').split('.').pop()?.toLowerCase() ?? '']
      if (!media || !image || !ext) {
        summary.images_failed++
        continue
      }
      const bytes = readMedia(media)
      if (!bytes) {
        summary.images_failed++
        continue
      }
      const kind = sniff(bytes.subarray(0, 64))
      const real =
        kind === 'png' ? 'png' : kind === 'jpeg' ? 'jpg' : kind === 'webp' ? 'webp' : null
      if (!real) {
        summary.images_failed++
        continue
      }
      const temp = files.storage.tempPath()
      await writeFile(temp, bytes)
      const name = `${image.sheet}-${image.anchor}.${real}`.replace(/[^\w.-]+/g, '_').slice(0, 200)
      const result = await execute(
        pool,
        `INSERT INTO file_objects (project_id, storage_backend, bucket_name, object_key, original_filename, original_mime,
                                   stored_mime, evidence_type, original_size_bytes, processing_status, scan_status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'SCREENSHOT', ?, 'PROCESSING', 'PENDING', ?)`,
        [
          job.projectId,
          STORAGE_BACKEND,
          BUCKET,
          files.storage.newKey(job.projectId, 'part'),
          name,
          real === 'jpg' ? 'image/jpeg' : `image/${real}`,
          real === 'jpg' ? 'image/jpeg' : `image/${real}`,
          bytes.length,
          job.createdBy,
        ],
      )
      const fileId = insertedId(result)
      await files.process({
        fileId,
        projectId: job.projectId,
        tempPath: temp,
        ext: real,
        type: 'SCREENSHOT',
      })
      const done = await select<{ processing_status: string; scan_status: string }>(
        pool,
        'SELECT processing_status, scan_status FROM file_objects WHERE id = ?',
        [fileId],
      )
      if (done[0]?.processing_status !== 'READY' || done[0]?.scan_status !== 'CLEAN') {
        summary.images_failed++
        continue
      }
      await execute(
        pool,
        'INSERT INTO execution_files (execution_id, file_object_id, caption, sort_order) VALUES (?, ?, ?, ?)',
        [executionId, fileId, `Bukti ${image.anchor}`, ++order],
      )
      await execute(
        pool,
        'INSERT INTO import_job_row_files (import_job_row_id, file_object_id, source_anchor) VALUES (?, ?, ?)',
        [rowId, fileId, `${image.sheet}!${image.anchor}`.slice(0, 100)],
      )
      linked++
    }
  }
  summary.images_imported = linked
  summary.images_left_out = Math.max(0, totalImages - linked - summary.images_failed)
  return { summary, rowErrors }
}
