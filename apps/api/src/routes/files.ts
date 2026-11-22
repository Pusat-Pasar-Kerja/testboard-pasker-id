import {
  EVIDENCE_RULES,
  EVIDENCE_TYPES,
  evidenceTypeFor,
  extensionOf,
  FILE_PROCESSING_STATUSES,
  isOneOf,
  UPLOAD_LIMITS,
  type EvidenceItem,
  type FileDto,
  type FileFailureReason,
  type FileUsage,
  type Paginated,
} from '@testboard/shared'
import busboy from 'busboy'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { requirePermission } from '../access/project-access.js'
import { execute, insertedId, select, selectOne, type Db } from '../db/tx.js'
import { FILE_SELECT, toFileDto, type FileRow } from '../files/dto.js'
import type { FileService } from '../files/pipeline.js'
import { MIME_FOR_EXTENSION } from '../files/sniff.js'
import { BUCKET, STORAGE_BACKEND } from '../files/storage.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import { idParam, pageParams } from '../lib/validation.js'
import type { AppEnv } from '../types.js'

/** Maximum accepted size of any single evidence file (largest per-type limit). */
const MAX_FILE_BYTES = Math.max(...EVIDENCE_TYPES.map((t) => EVIDENCE_RULES[t].maxBytes))

const isLead = (role: string) => role === 'ADMIN' || role === 'QA_LEAD'

/** Name safe for display/storage metadata: no paths, no control characters, bounded. */
function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = [...base]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .trim()
  return (cleaned || 'file').slice(0, 200)
}

/** RFC 6266 Content-Disposition with an ASCII fallback and UTF-8 name. */
function disposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Download name: original base name with the extension of the stored format. */
function downloadName(row: FileRow): string {
  const storedExt = row.object_key.replace(/\.gz$/, '').split('.').pop() ?? ''
  const base = row.original_filename.replace(/\.[A-Za-z0-9]{1,10}$/, '')
  return `${base}.${storedExt}`
}

async function loadFile(db: Db, projectId: string, fileId: string) {
  const row = await selectOne<FileRow>(
    db,
    `${FILE_SELECT} WHERE f.id = ? AND f.project_id = ? AND f.deleted_at IS NULL`,
    [fileId, projectId],
  )
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return row
}

/** Where each file is used (Evidence Center links). */
async function usagesOf(db: Db, fileIds: string[]): Promise<Map<string, FileUsage[]>> {
  const map = new Map<string, FileUsage[]>()
  if (fileIds.length === 0) return map
  const marks = fileIds.map(() => '?').join(', ')
  const add = (id: string, usage: FileUsage) => {
    const list = map.get(String(id)) ?? []
    list.push(usage)
    map.set(String(id), list)
  }
  const [executions, defects, cases] = await Promise.all([
    select<{
      file_id: string
      run_id: string
      run_code: string
      run_case_id: string
      case_code: string
      attempt_number: number
    }>(
      db,
      `SELECT l.file_object_id AS file_id, r.id AS run_id, r.run_code, trc.id AS run_case_id,
              tc.case_code, e.attempt_number
         FROM execution_files l
         JOIN test_executions e ON e.id = l.execution_id
         JOIN test_run_cases trc ON trc.id = e.run_case_id
         JOIN test_runs r ON r.id = trc.test_run_id
         JOIN test_cases tc ON tc.id = trc.test_case_id
        WHERE l.file_object_id IN (${marks})`,
      fileIds,
    ),
    select<{ file_id: string; defect_id: string; bug_code: string }>(
      db,
      `SELECT l.file_object_id AS file_id, d.id AS defect_id, d.bug_code
         FROM defect_files l JOIN defects d ON d.id = l.defect_id
        WHERE l.file_object_id IN (${marks})`,
      fileIds,
    ),
    select<{ file_id: string; case_id: string; case_code: string }>(
      db,
      `SELECT l.file_object_id AS file_id, tc.id AS case_id, tc.case_code
         FROM test_case_files l JOIN test_cases tc ON tc.id = l.test_case_id
        WHERE l.file_object_id IN (${marks})`,
      fileIds,
    ),
  ])
  for (const e of executions) {
    add(e.file_id, {
      kind: 'EXECUTION',
      label: `${e.run_code} / ${e.case_code} #${e.attempt_number}`,
      path: `runs/${e.run_id}/cases/${e.run_case_id}`,
    })
  }
  for (const d of defects)
    add(d.file_id, { kind: 'DEFECT', label: d.bug_code, path: `bugs/${d.defect_id}` })
  for (const t of cases)
    add(t.file_id, { kind: 'TEST_CASE', label: t.case_code, path: `test-cases/${t.case_id}` })
  return map
}

interface Incoming {
  filename: string
  ext: string
  tempPath: string
  size: number
  sha256: string
  reason: FileFailureReason | null
}

/**
 * Stream a multipart body straight to quarantine files (never buffering whole uploads in
 * memory), enforcing per-type size limits while the bytes arrive.
 */
async function receiveUpload(c: Context<AppEnv>, files: FileService): Promise<Incoming[]> {
  const contentType = c.req.header('Content-Type') ?? ''
  if (!/^multipart\/form-data/i.test(contentType)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Use multipart/form-data with one or more "files".')
  }
  const declared = Number(c.req.header('Content-Length') ?? '0')
  if (declared > UPLOAD_LIMITS.requestBytes) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The upload is larger than allowed.')
  }
  const body = c.req.raw.body
  if (!body) throw new AppError(400, 'VALIDATION_ERROR', 'Empty upload.')

  const received: Incoming[] = []
  const writes: Promise<void>[] = []
  let total = 0
  let tooMany = false
  let tooBig = false

  await new Promise<void>((resolve, reject) => {
    const parser = busboy({
      headers: { 'content-type': contentType },
      limits: {
        files: UPLOAD_LIMITS.filesPerRequest,
        fileSize: MAX_FILE_BYTES + 1,
        fields: 10,
        parts: UPLOAD_LIMITS.filesPerRequest + 10,
        fieldSize: 1024,
      },
    })
    parser.on('file', (_field, stream, info) => {
      const filename = cleanFilename(info.filename ?? '')
      const ext = extensionOf(filename)
      const type = evidenceTypeFor(filename)
      const tempPath = files.storage.tempPath()
      const hash = createHash('sha256')
      const limit = type ? EVIDENCE_RULES[type].maxBytes : 0
      const entry: Incoming = { filename, ext, tempPath, size: 0, sha256: '', reason: null }
      received.push(entry)
      if (!type) {
        entry.reason = 'TYPE_NOT_ALLOWED'
        stream.resume()
        return
      }
      const out = createWriteStream(tempPath, { flags: 'wx' })
      stream.on('data', (chunk: Buffer) => {
        entry.size += chunk.length
        total += chunk.length
        if (total > UPLOAD_LIMITS.requestBytes) tooBig = true
        if (entry.size > limit && !entry.reason) {
          entry.reason = 'TOO_LARGE'
          stream.unpipe(out)
          out.destroy()
          stream.resume()
          return
        }
        hash.update(chunk)
      })
      stream.on('limit', () => {
        entry.reason = 'TOO_LARGE'
      })
      writes.push(
        pipeline(stream, out)
          .catch(() => {
            entry.reason ??= 'TOO_LARGE'
          })
          .then(() => {
            entry.sha256 = hash.digest('hex')
          }),
      )
    })
    parser.on('filesLimit', () => {
      tooMany = true
    })
    parser.on('error', reject)
    parser.on('close', resolve)
    Readable.fromWeb(body as NodeReadableStream).pipe(parser)
  })
  await Promise.all(writes)

  if (tooMany || tooBig) {
    await Promise.all(received.map((r) => files.storage.removeTemp(r.tempPath)))
    throw new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      tooMany
        ? `At most ${UPLOAD_LIMITS.filesPerRequest} files per upload.`
        : 'The upload is larger than allowed.',
    )
  }
  if (received.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'files', message: 'Choose at least one file' },
    ])
  }
  for (const r of received) {
    if (!r.reason && r.size === 0) r.reason = 'EMPTY'
  }
  return received
}

export type ServeMode = 'preview' | 'download' | 'thumbnail'

/** Streams a released file. Only READY + CLEAN files are ever served (TB-FILE-005). */
export async function serveFile(
  c: Context<AppEnv>,
  pool: Pool,
  files: FileService,
  projectId: string,
  fileId: string,
  requested: ServeMode,
  options: { audit?: boolean } = {},
) {
  const project = { id: projectId }
  const row = await loadFile(pool, project.id, fileId)
  if (row.processing_status !== 'READY' || row.scan_status !== 'CLEAN') {
    throw new AppError(409, 'CONFLICT', 'This file is not available.')
  }
  // A thumbnail is only stored when it is smaller than the picture (flat screenshots often
  // are not): then the picture itself is the thumbnail.
  const mode: ServeMode =
    requested === 'thumbnail' && !row.thumbnail_object_key && row.stored_mime.startsWith('image/')
      ? 'preview'
      : requested
  const key = mode === 'thumbnail' ? row.thumbnail_object_key : row.object_key
  if (!key) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  const gzipped = mode !== 'thumbnail' && row.compression_method === 'GZIP'
  const isImage = row.stored_mime.startsWith('image/')
  const isPdf = row.stored_mime === 'application/pdf'
  const isText = row.evidence_type === 'LOG'
  const inline = mode === 'thumbnail' || (mode === 'preview' && (isImage || isPdf || isText))

  // Logs are always shown as plain text (never as HTML/JSON a browser might execute).
  const contentType =
    mode === 'thumbnail'
      ? 'image/webp'
      : isText && inline
        ? 'text/plain; charset=utf-8'
        : row.stored_mime
  c.header('Content-Type', contentType)
  c.header('Content-Disposition', disposition(inline ? 'inline' : 'attachment', downloadName(row)))
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  )
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  c.header('X-Content-Type-Options', 'nosniff')

  if (mode === 'download' && options.audit !== false) {
    await writeAudit(pool, c, {
      projectId: project.id,
      entityType: 'file',
      entityId: String(row.id),
      action: 'DOWNLOAD',
    })
  }

  if (gzipped) {
    // Stored compressed; the user always receives the original text.
    const stream = files.storage.read(key).pipe(createGunzip())
    return c.body(Readable.toWeb(stream) as ReadableStream)
  }

  const size = await files.storage.size(key)
  c.header('Accept-Ranges', 'bytes')
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('Range') ?? '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      c.header('Content-Range', `bytes */${size}`)
      return c.body(null, 416)
    }
    c.header('Content-Range', `bytes ${start}-${end}/${size}`)
    c.header('Content-Length', String(end - start + 1))
    return c.body(Readable.toWeb(files.storage.read(key, { start, end })) as ReadableStream, 206)
  }
  c.header('Content-Length', String(size))
  return c.body(Readable.toWeb(files.storage.read(key)) as ReadableStream)
}

/** Receive evidence files (multipart) for a project and queue them for processing. */
export async function uploadEvidence(
  c: Context<AppEnv>,
  pool: Pool,
  files: FileService,
  projectId: string,
  userId: string | null,
): Promise<{
  files: FileDto[]
  rejected: { original_filename: string; failure_reason: FileFailureReason }[]
}> {
  const project = { id: projectId }
  const incoming = await receiveUpload(c, files)
  const created: FileDto[] = []
  const rejected: { original_filename: string; failure_reason: FileFailureReason }[] = []

  for (const item of incoming) {
    const type = evidenceTypeFor(item.filename)
    if (!type) {
      rejected.push({ original_filename: item.filename, failure_reason: 'TYPE_NOT_ALLOWED' })
      continue
    }
    const placeholder = files.storage.newKey(project.id, 'part')
    const mime = MIME_FOR_EXTENSION[item.ext] ?? 'application/octet-stream'
    const result = await execute(
      pool,
      `INSERT INTO file_objects
         (project_id, storage_backend, bucket_name, object_key, original_filename,
          original_mime, stored_mime, evidence_type, original_size_bytes, original_sha256,
          processing_status, scan_status, failure_reason, uploaded_by, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, IF(? IS NULL, NULL, UTC_TIMESTAMP(3)))`,
      [
        project.id,
        STORAGE_BACKEND,
        BUCKET,
        placeholder,
        item.filename,
        mime,
        mime,
        type,
        item.size,
        item.reason ? null : item.sha256,
        item.reason ? 'REJECTED' : 'PROCESSING',
        item.reason,
        userId,
        item.reason,
      ],
    )
    const fileId = insertedId(result)
    if (item.reason) {
      await files.storage.removeTemp(item.tempPath)
    } else {
      files.enqueue({
        fileId,
        projectId: project.id,
        tempPath: item.tempPath,
        ext: item.ext,
        type,
      })
    }
    created.push(toFileDto(await loadFile(pool, project.id, fileId)))
  }
  return { files: created, rejected }
}

export function fileRoutes(pool: Pool, files: FileService) {
  const routes = new Hono<AppEnv>()

  routes.post('/', requirePermission('file.upload'), async (c) => {
    const project = c.get('project')
    const result = await uploadEvidence(c, pool, files, project.id, c.get('auth')?.userId ?? null)
    return c.json(result, 202)
  })

  routes.get('/', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const { page, pageSize, offset } = pageParams(c)
    const where = ['f.project_id = ?', 'f.deleted_at IS NULL']
    const params: unknown[] = [project.id]
    const type = c.req.query('type')
    if (isOneOf(EVIDENCE_TYPES)(type)) {
      where.push('f.evidence_type = ?')
      params.push(type)
    }
    const status = c.req.query('status')
    if (isOneOf(FILE_PROCESSING_STATUSES)(status)) {
      where.push('f.processing_status = ?')
      params.push(status)
    }
    const q = c.req.query('q')?.trim()
    if (q) {
      where.push('f.original_filename LIKE ?')
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)
    }
    if (c.req.query('unlinked') === '1') {
      where.push(`NOT EXISTS (SELECT 1 FROM execution_files x WHERE x.file_object_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM defect_files x WHERE x.file_object_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM test_case_files x WHERE x.file_object_id = f.id)`)
    }
    const filter = `WHERE ${where.join(' AND ')}`
    const total = await selectOne<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM file_objects f ${filter}`,
      params,
    )
    const rows = await select<FileRow>(
      pool,
      `${FILE_SELECT} ${filter} ORDER BY f.uploaded_at DESC, f.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )
    const usages = await usagesOf(
      pool,
      rows.map((r) => String(r.id)),
    )
    const body: Paginated<EvidenceItem> = {
      data: rows.map((row) => ({ ...toFileDto(row), usages: usages.get(String(row.id)) ?? [] })),
      page,
      page_size: pageSize,
      total: Number(total?.n ?? 0),
    }
    return c.json(body)
  })

  routes.get('/:fileId', requirePermission('project.read'), async (c) => {
    const project = c.get('project')
    const row = await loadFile(pool, project.id, idParam(c, 'fileId'))
    const usages = await usagesOf(pool, [String(row.id)])
    const item: EvidenceItem = { ...toFileDto(row), usages: usages.get(String(row.id)) ?? [] }
    return c.json(item)
  })

  routes.get('/:fileId/status', requirePermission('project.read'), async (c) => {
    const row = await loadFile(pool, c.get('project').id, idParam(c, 'fileId'))
    return c.json(toFileDto(row))
  })

  const serve = (c: Context<AppEnv>, mode: ServeMode) =>
    serveFile(c, pool, files, c.get('project').id, idParam(c, 'fileId'), mode)

  routes.get('/:fileId/preview', requirePermission('project.read'), (c) => serve(c, 'preview'))
  routes.get('/:fileId/thumbnail', requirePermission('project.read'), (c) => serve(c, 'thumbnail'))
  routes.get('/:fileId/download', requirePermission('project.read'), (c) => serve(c, 'download'))

  /** Remove an upload that was never attached (cancelled or mistaken). Soft delete. */
  routes.delete('/:fileId', requirePermission('file.upload'), async (c) => {
    const project = c.get('project')
    const row = await loadFile(pool, project.id, idParam(c, 'fileId'))
    const userId = c.get('auth')?.userId ?? ''
    if (!isLead(project.role) && String(row.uploaded_by) !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'Only the uploader or a lead can remove this file.')
    }
    const usages = await usagesOf(pool, [String(row.id)])
    if ((usages.get(String(row.id)) ?? []).length > 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'This file is attached as evidence and cannot be removed.',
      )
    }
    await execute(pool, 'UPDATE file_objects SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [
      row.id,
    ])
    await writeAudit(pool, c, {
      projectId: project.id,
      entityType: 'file',
      entityId: String(row.id),
      action: 'DELETE',
    })
    return c.body(null, 204)
  })

  return routes
}
