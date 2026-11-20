import {
  CSV_MIME,
  extensionOf,
  IMPORT_LIMITS,
  IMPORT_ROW_STATUSES,
  importConfigSchema,
  isOneOf,
  type ImportConfig,
  type ImportIssue,
  type ImportJobDto,
  type ImportJobStatus,
  type ImportPreview,
  type ImportResultSummary,
  type ImportRowDto,
  type ImportSourceFormat,
  type ImportSourceKind,
  type Paginated,
  type TabularValue,
  toCsv,
} from '@testboard/shared'
import busboy from 'busboy'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { createWriteStream } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { requirePermission } from '../access/project-access.js'
import {
  execute,
  insertedId,
  iso,
  parseJson,
  select,
  selectOne,
  withTransaction,
} from '../db/tx.js'
import type { FileService } from '../files/pipeline.js'
import { sniff } from '../files/sniff.js'
import { extractZipEntry, readZipEntries } from '../files/zip.js'
import {
  ImportSourceError,
  parseSource,
  sheetInfo,
  type ImportStore,
  type ParsedSource,
} from '../imports/analyze.js'
import { commitImport, prepareImport, saveRows } from '../imports/service.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams, parseBody } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

interface JobRow {
  id: string
  project_id: string
  original_filename: string
  source_format: ImportSourceFormat
  source_kind: ImportSourceKind
  import_mode: ImportConfig['import_mode']
  status_code: ImportJobStatus
  column_mapping_json: unknown
  total_rows: number
  valid_rows: number
  imported_rows: number
  skipped_rows: number
  invalid_rows: number
  error_summary: string | null
  created_by: string | null
  creator_name: string | null
  created_at: Date
  completed_at: Date | null
}

const JOB_SELECT = `
  SELECT j.*, u.display_name AS creator_name
    FROM import_jobs j LEFT JOIN users u ON u.id = j.created_by`

const FORMAT_BY_EXT: Record<string, ImportSourceFormat> = { xlsx: 'XLSX', csv: 'CSV', json: 'JSON' }

async function loadJob(db: Pool, projectId: string, jobId: string) {
  const row = await selectOne<JobRow>(db, `${JOB_SELECT} WHERE j.id = ? AND j.project_id = ?`, [
    jobId,
    projectId,
  ])
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

function summaryOf(row: JobRow): { result: ImportResultSummary | null; failure: string | null } {
  const parsed = parseJson<{ result?: ImportResultSummary; failure?: string }>(row.error_summary)
  return { result: parsed?.result ?? null, failure: parsed?.failure ?? null }
}

async function jobDto(row: JobRow, store: ImportStore, full: boolean): Promise<ImportJobDto> {
  const parsed = full ? await store.readJson<ParsedSource>(String(row.id), 'parsed') : null
  const preview = full
    ? await store.readJson<{ preview: ImportPreview }>(String(row.id), 'preview')
    : null
  const { result, failure } = summaryOf(row)
  return {
    id: String(row.id),
    original_filename: row.original_filename,
    source_format: row.source_format,
    source_kind: row.source_kind,
    import_mode: row.import_mode,
    status_code: row.status_code,
    total_rows: Number(row.total_rows),
    valid_rows: Number(row.valid_rows),
    imported_rows: Number(row.imported_rows),
    skipped_rows: Number(row.skipped_rows),
    invalid_rows: Number(row.invalid_rows),
    created_by: row.created_by
      ? { id: String(row.created_by), display_name: row.creator_name ?? '' }
      : null,
    created_at: iso(row.created_at) as string,
    completed_at: iso(row.completed_at),
    sheets: parsed ? parsed.sheets.map((s) => sheetInfo(s, row.source_format)) : [],
    config: parseJson<ImportConfig>(row.column_mapping_json),
    preview: preview?.preview ?? null,
    result,
    failure,
  }
}

/** Receive one source file (multipart field "file") into quarantine. */
async function receiveSource(c: Context<AppEnv>, files: FileService) {
  const contentType = c.req.header('Content-Type') ?? ''
  if (!/^multipart\/form-data/i.test(contentType)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Use multipart/form-data with a "file".')
  }
  if (Number(c.req.header('Content-Length') ?? '0') > IMPORT_LIMITS.fileBytes + 64 * 1024) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The file is larger than allowed.')
  }
  const body = c.req.raw.body
  if (!body) throw new AppError(400, 'VALIDATION_ERROR', 'Empty upload.')
  let received: { filename: string; path: string; size: number; truncated: boolean } | null = null
  const writes: Promise<void>[] = []
  await new Promise<void>((resolve, reject) => {
    const parser = busboy({
      headers: { 'content-type': contentType },
      limits: { files: 1, fileSize: IMPORT_LIMITS.fileBytes, fields: 5, parts: 6 },
    })
    parser.on('file', (_field, stream, info) => {
      const path = files.storage.tempPath()
      const entry = {
        filename: (info.filename ?? '').split(/[\\/]/).pop()?.slice(0, 200) ?? '',
        path,
        size: 0,
        truncated: false,
      }
      received = entry
      stream.on('data', (chunk: Buffer) => {
        entry.size += chunk.length
      })
      stream.on('limit', () => {
        entry.truncated = true
      })
      writes.push(pipeline(stream, createWriteStream(path, { flags: 'wx' })))
    })
    parser.on('error', reject)
    parser.on('close', resolve)
    Readable.fromWeb(body as NodeReadableStream).pipe(parser)
  })
  await Promise.all(writes)
  const file = received as {
    filename: string
    path: string
    size: number
    truncated: boolean
  } | null
  if (!file) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'file', message: 'Choose a file' },
    ])
  }
  if (file.truncated) {
    await rm(file.path, { force: true })
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The file is larger than allowed.')
  }
  return file
}

const invalidFile = (message: string) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
    { field: 'file', message },
  ])

export function importRoutes(pool: Pool, files: FileService, store: ImportStore) {
  const routes = new Hono<AppEnv>()

  routes.post('/', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const upload = await receiveSource(c, files)
    try {
      const format = FORMAT_BY_EXT[extensionOf(upload.filename)]
      if (!format) throw invalidFile('TYPE_NOT_ALLOWED')
      if (upload.size === 0) throw invalidFile('EMPTY')
      const bytes = await readFile(upload.path)
      const kind = sniff(bytes.subarray(0, 4096))
      if ((format === 'XLSX' && kind !== 'zip') || (format !== 'XLSX' && kind !== 'text')) {
        throw invalidFile('SIGNATURE_MISMATCH')
      }
      let parsed: ParsedSource
      try {
        parsed = parseSource(format, bytes)
      } catch (error) {
        if (error instanceof ImportSourceError) throw invalidFile(error.message)
        throw error
      }
      const result = await execute(
        pool,
        `INSERT INTO import_jobs (project_id, original_filename, source_format, source_kind, import_mode, status_code, created_by)
         VALUES (?, ?, ?, ?, 'CREATE_ONLY', 'UPLOADED', ?)`,
        [
          project.id,
          upload.filename || `import.${format.toLowerCase()}`,
          format,
          parsed.kind,
          c.get('auth')?.userId ?? null,
        ],
      )
      const jobId = insertedId(result)
      await store.saveSource(jobId, upload.path, format)
      await store.writeJson(jobId, 'parsed', parsed)
      await writeAudit(pool, c, {
        projectId: project.id,
        entityType: 'import_job',
        entityId: jobId,
        action: 'CREATE',
        newValues: { filename: upload.filename, format },
      })
      return c.json(await jobDto(await loadJob(pool, project.id, jobId), store, true), 201)
    } finally {
      await rm(upload.path, { force: true })
    }
  })

  routes.get('/', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const { page, pageSize, offset } = pageParams(c)
    const total = await selectOne<{ n: number }>(
      pool,
      'SELECT COUNT(*) AS n FROM import_jobs WHERE project_id = ?',
      [project.id],
    )
    const rows = await select<JobRow>(
      pool,
      `${JOB_SELECT} WHERE j.project_id = ? ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`,
      [project.id, pageSize, offset],
    )
    const body: Paginated<ImportJobDto> = {
      data: await Promise.all(rows.map((row) => jobDto(row, store, false))),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  routes.get('/:jobId', requirePermission('import.manage'), async (c) => {
    const row = await loadJob(pool, c.get('project').id, idParam(c, 'jobId'))
    return c.json(await jobDto(row, store, true))
  })

  /** Choose sheets, header rows, mapping and options; returns the validated preview. */
  routes.put('/:jobId/config', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const job = await loadJob(pool, project.id, idParam(c, 'jobId'))
    if (job.status_code !== 'UPLOADED' && job.status_code !== 'PREVIEW') {
      throw new AppError(409, 'CONFLICT', 'This import can no longer be changed.')
    }
    const config = (await parseBody(c, importConfigSchema)) as ImportConfig
    const parsed = await store.readJson<ParsedSource>(String(job.id), 'parsed')
    if (!parsed) throw new AppError(409, 'CONFLICT', 'The uploaded file is no longer available.')
    for (const sheet of config.sheets) {
      if (!parsed.sheets.some((s) => s.name === sheet.name)) {
        throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
          { field: 'sheets', message: `Sheet not found: ${sheet.name}` },
        ])
      }
    }
    const { rows, preview, images } = await prepareImport(pool, project.id, parsed, config)
    await withTransaction(pool, async (conn) => {
      await saveRows(conn, String(job.id), rows)
      await execute(
        conn,
        `UPDATE import_jobs
            SET status_code = 'PREVIEW', import_mode = ?, column_mapping_json = ?, selected_sheets_json = ?,
                total_rows = ?, valid_rows = ?, invalid_rows = ?, skipped_rows = ?, imported_rows = 0
          WHERE id = ?`,
        [
          config.import_mode,
          JSON.stringify(config),
          JSON.stringify(config.sheets.map((s) => s.name)),
          preview.counts.total,
          preview.counts.valid + preview.counts.review,
          preview.counts.invalid,
          preview.counts.duplicate,
          job.id,
        ],
      )
    })
    await store.writeJson(String(job.id), 'preview', { preview, images })
    return c.json(await jobDto(await loadJob(pool, project.id, String(job.id)), store, true))
  })

  routes.get('/:jobId/rows', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const job = await loadJob(pool, project.id, idParam(c, 'jobId'))
    const { page, pageSize, offset } = pageParams(c)
    const where = ['import_job_id = ?']
    const params: unknown[] = [job.id]
    const status = c.req.query('status')
    if (status === 'review') {
      where.push("status_code = 'VALID' AND JSON_LENGTH(validation_errors_json) > 0")
    } else if (status === 'ok') {
      where.push("status_code = 'VALID' AND JSON_LENGTH(validation_errors_json) = 0")
    } else if (isOneOf(IMPORT_ROW_STATUSES)(status)) {
      where.push('status_code = ?')
      params.push(status)
    }
    const filter = `WHERE ${where.join(' AND ')}`
    const total = await selectOne<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM import_job_rows ${filter}`,
      params,
    )
    const rows = await select<{
      id: string
      sheet_name: string | null
      source_row_number: number | null
      external_case_code: string | null
      status_code: ImportRowDto['status_code']
      mapped_payload_json: unknown
      validation_errors_json: unknown
      target_test_case_id: string | null
    }>(
      pool,
      `SELECT id, sheet_name, source_row_number, external_case_code, status_code, mapped_payload_json,
              validation_errors_json, target_test_case_id
         FROM import_job_rows ${filter} ORDER BY id LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const body: Paginated<ImportRowDto> = {
      data: rows.map((r) => {
        const mapped = parseJson<{
          values?: { title?: string; module_code?: string }
          result?: { status?: ImportRowDto['result_status'] }
          action?: ImportRowDto['action']
          duplicate_of?: string | null
          images?: string[]
        }>(r.mapped_payload_json)
        return {
          id: String(r.id),
          sheet_name: r.sheet_name,
          source_row_number: r.source_row_number === null ? null : Number(r.source_row_number),
          external_case_code: r.external_case_code,
          status_code: r.status_code,
          action: mapped?.action ?? null,
          title: mapped?.values?.title ?? null,
          module_code: mapped?.values?.module_code ?? null,
          result_status:
            mapped?.result?.status && mapped.result.status !== ('IGNORE' as never)
              ? mapped.result.status
              : null,
          issues: parseJson<ImportIssue[]>(r.validation_errors_json) ?? [],
          duplicate_of: mapped?.duplicate_of ?? null,
          target_test_case_id: r.target_test_case_id ? String(r.target_test_case_id) : null,
          image_count: mapped?.images?.length ?? 0,
        }
      }),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  /** Rows that need attention, as CSV for the spreadsheet owner (formula-safe). */
  routes.get('/:jobId/errors.csv', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const job = await loadJob(pool, project.id, idParam(c, 'jobId'))
    const rows = await select<{
      sheet_name: string
      source_row_number: number
      external_case_code: string | null
      status_code: string
      mapped_payload_json: unknown
      validation_errors_json: unknown
    }>(
      pool,
      `SELECT sheet_name, source_row_number, external_case_code, status_code, mapped_payload_json, validation_errors_json
         FROM import_job_rows
        WHERE import_job_id = ? AND (status_code IN ('ERROR', 'DUPLICATE') OR JSON_LENGTH(validation_errors_json) > 0)
        ORDER BY id`,
      [job.id],
    )
    const lines: TabularValue[][] = []
    for (const r of rows) {
      const mapped = parseJson<{ values?: { title?: string }; duplicate_of?: string | null }>(
        r.mapped_payload_json,
      )
      const issues = (parseJson<ImportIssue[]>(r.validation_errors_json) ?? []).map(
        (i) => `${i.level}:${i.field ?? '-'}:${i.code}${i.value ? `(${i.value})` : ''}`,
      )
      if (mapped?.duplicate_of) issues.push(`duplicate_of:${mapped.duplicate_of}`)
      lines.push([
        r.sheet_name,
        r.source_row_number,
        r.external_case_code,
        mapped?.values?.title,
        r.status_code,
        issues.join(' | '),
      ])
    }
    c.header('Content-Type', CSV_MIME)
    c.header('Content-Disposition', `attachment; filename="import-${job.id}-errors.csv"`)
    return c.body(toCsv(['sheet', 'row', 'case_code', 'title', 'status', 'issues'], lines))
  })

  /** Embedded image from the uploaded workbook, for the review step (lead-only). */
  routes.get('/:jobId/images/:key', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const job = await loadJob(pool, project.id, idParam(c, 'jobId'))
    const key = c.req.param('key')
    const parsed =
      job.source_format === 'XLSX'
        ? await store.readJson<ParsedSource>(String(job.id), 'parsed')
        : null
    const image = parsed?.sheets.flatMap((s) => s.images).find((i) => i.key === key)
    if (!image) throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const bytes = await store.readSource(String(job.id), 'XLSX')
    const entry = readZipEntries(bytes)?.find((e) => e.name === image.media)
    if (!entry || entry.uncompressedSize > 30 * 1024 * 1024)
      throw new AppError(404, 'NOT_FOUND', 'Not found.')
    const media = extractZipEntry(bytes, entry)
    const kind = sniff(media.subarray(0, 64))
    if (kind !== 'png' && kind !== 'jpeg' && kind !== 'webp')
      throw new AppError(404, 'NOT_FOUND', 'Not found.')
    c.header('Content-Type', kind === 'jpeg' ? 'image/jpeg' : `image/${kind}`)
    c.header('Content-Security-Policy', "default-src 'none'; sandbox")
    c.header('X-Content-Type-Options', 'nosniff')
    return c.body(new Uint8Array(media))
  })

  /** Apply the preview in the background; the client polls the job until it settles. */
  routes.post('/:jobId/commit', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const jobId = idParam(c, 'jobId')
    const claimed = await execute(
      pool,
      "UPDATE import_jobs SET status_code = 'IMPORTING' WHERE id = ? AND project_id = ? AND status_code = 'PREVIEW'",
      [jobId, project.id],
    )
    if (claimed.affectedRows === 0)
      throw new AppError(409, 'CONFLICT', 'This import is not ready to be applied.')
    const job = await loadJob(pool, project.id, jobId)
    const config = parseJson<ImportConfig>(job.column_mapping_json) as ImportConfig
    void (async () => {
      try {
        const { summary, rowErrors } = await commitImport(
          pool,
          files,
          store,
          {
            id: jobId,
            projectId: project.id,
            filename: job.original_filename,
            format: job.source_format,
            kind: job.source_kind,
            createdBy: c.get('auth')?.userId ?? null,
          },
          config,
          c,
        )
        const partial = Number(job.invalid_rows) + rowErrors > 0 || summary.images_failed > 0
        await execute(
          pool,
          `UPDATE import_jobs
              SET status_code = ?, imported_rows = ?, skipped_rows = ?, invalid_rows = invalid_rows + ?,
                  error_summary = ?, completed_at = UTC_TIMESTAMP(3)
            WHERE id = ?`,
          [
            partial ? 'PARTIAL' : 'COMPLETED',
            summary.created_cases + summary.updated_cases + summary.executions,
            summary.skipped_rows,
            rowErrors,
            JSON.stringify({ result: summary }),
            jobId,
          ],
        )
        await store.remove(jobId)
      } catch (error) {
        console.error('[imports] commit failed', error)
        await execute(
          pool,
          "UPDATE import_jobs SET status_code = 'FAILED', error_summary = ?, completed_at = UTC_TIMESTAMP(3) WHERE id = ?",
          [JSON.stringify({ failure: 'COMMIT_FAILED' }), jobId],
        ).catch(() => undefined)
      }
    })()
    return c.json(await jobDto(job, store, true), 202)
  })

  /** Cancel an import that was not applied; its uploaded source is deleted. */
  routes.delete('/:jobId', requirePermission('import.manage'), async (c) => {
    const project = c.get('project')
    const job = await loadJob(pool, project.id, idParam(c, 'jobId'))
    if (!['UPLOADED', 'PREVIEW', 'FAILED'].includes(job.status_code)) {
      throw new AppError(409, 'CONFLICT', 'An applied import is kept as history.')
    }
    await execute(pool, 'DELETE FROM import_jobs WHERE id = ?', [job.id])
    await store.remove(String(job.id))
    return c.body(null, 204)
  })

  return routes
}
