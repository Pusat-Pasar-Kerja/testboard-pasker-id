import type { EvidenceType, FileFailureReason } from '@testboard/shared'
import type { Pool } from 'mysql2/promise'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { AppConfig } from '../config/env.js'
import { execute } from '../db/tx.js'
import { processImage, processOffice, processPdf, processText, type Processed } from './process.js'
import { BasicScanner, ClamdScanner, type Scanner } from './scanner.js'
import { KIND_FOR_EXTENSION, sniff } from './sniff.js'
import { LocalStorage } from './storage.js'

export interface FileJob {
  fileId: string
  projectId: string
  tempPath: string
  ext: string
  type: EvidenceType
}

/** Small in-process FIFO queue: uploads return immediately, processing runs behind. */
class JobQueue {
  private readonly waiting: (() => Promise<void>)[] = []
  private running = 0
  private idleResolvers: (() => void)[] = []

  constructor(private readonly concurrency: number) {}

  push(job: () => Promise<void>) {
    this.waiting.push(job)
    this.next()
  }

  private next() {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift() as () => Promise<void>
      this.running++
      void job().finally(() => {
        this.running--
        this.next()
      })
    }
    if (this.running === 0 && this.waiting.length === 0) {
      for (const resolve of this.idleResolvers.splice(0)) resolve()
    }
  }

  idle(): Promise<void> {
    if (this.running === 0 && this.waiting.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleResolvers.push(resolve))
  }
}

export interface FileService {
  storage: LocalStorage
  scanner: Scanner
  enqueue(job: FileJob): void
  /** Resolves when no file is waiting or being processed (tests, graceful shutdown). */
  idle(): Promise<void>
  /** Startup: anything left PROCESSING by a previous process is failed, quarantine cleared. */
  recover(): Promise<number>
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

export function createFileService(
  pool: Pool,
  config: Pick<AppConfig, 'storageDir' | 'scan'>,
  options: { scanner?: Scanner; logError?: (error: unknown) => void } = {},
): FileService {
  const storage = new LocalStorage(config.storageDir)
  const scanner =
    options.scanner ??
    (config.scan.engine === 'clamav'
      ? new ClamdScanner(config.scan.clamdHost, config.scan.clamdPort)
      : new BasicScanner())
  const queue = new JobQueue(2)
  const ready = storage.init()

  const finish = (
    fileId: string,
    status: 'REJECTED' | 'FAILED',
    reason: FileFailureReason,
    scan?: { status: string; engine: string },
  ) =>
    execute(
      pool,
      `UPDATE file_objects
          SET processing_status = ?, failure_reason = ?, processed_at = UTC_TIMESTAMP(3),
              scan_status = COALESCE(?, IF(scan_status = 'PENDING', 'ERROR', scan_status)),
              scan_engine = COALESCE(?, scan_engine),
              scanned_at = IF(? IS NULL, scanned_at, UTC_TIMESTAMP(3))
        WHERE id = ?`,
      [status, reason, scan?.status ?? null, scan?.engine ?? null, scan?.engine ?? null, fileId],
    )

  async function run(job: FileJob) {
    try {
      const input = await readFile(job.tempPath)
      // 1. Real type from the bytes must match the accepted extension.
      if (sniff(input.subarray(0, 4096)) !== KIND_FOR_EXTENSION[job.ext]) {
        await finish(job.fileId, 'REJECTED', 'SIGNATURE_MISMATCH')
        return
      }
      // 2. Scan before anything else touches the content. ERROR is never CLEAN.
      const scan = await scanner.scan(input)
      if (scan.status === 'INFECTED') {
        await finish(job.fileId, 'REJECTED', 'INFECTED', scan)
        return
      }
      if (scan.status === 'ERROR') {
        await finish(job.fileId, 'FAILED', 'SCAN_ERROR', scan)
        return
      }
      // 3. Validate + optimise + verify per type.
      let result: Processed
      if (job.type === 'SCREENSHOT') {
        result = await processImage(
          input,
          job.ext === 'jpg' ? 'jpeg' : (job.ext as 'png' | 'jpeg' | 'webp'),
        )
      } else if (job.ext === 'pdf') {
        result = processPdf(input)
      } else if (job.ext === 'docx' || job.ext === 'xlsx') {
        result = processOffice(input, job.ext)
      } else {
        result = processText(input, job.ext)
      }
      if (!result.ok) {
        await finish(job.fileId, 'REJECTED', result.reason, scan)
        return
      }
      // 4. Release atomically into private storage, then record everything.
      const key = storage.newKey(job.projectId, result.ext)
      await storage.putBytes(key, result.bytes)
      let thumbKey: string | null = null
      if (result.thumbnail) {
        thumbKey = key.replace(/\.[a-z0-9.]+$/, '.thumb.webp')
        await storage.putBytes(thumbKey, result.thumbnail)
      }
      await execute(
        pool,
        `UPDATE file_objects
            SET object_key = ?, stored_mime = ?, stored_size_bytes = ?, original_sha256 = ?,
                stored_sha256 = ?, compression_method = ?, compression_note = ?,
                processing_status = 'READY', scan_status = 'CLEAN', scan_engine = ?,
                scanned_at = UTC_TIMESTAMP(3), width_px = ?, height_px = ?,
                thumbnail_object_key = ?, processed_at = UTC_TIMESTAMP(3), failure_reason = NULL
          WHERE id = ?`,
        [
          key,
          result.mime,
          result.bytes.length,
          sha256(input),
          sha256(result.bytes),
          result.method,
          result.notes.length > 0 ? result.notes.join(',') : null,
          scan.engine,
          result.width ?? null,
          result.height ?? null,
          thumbKey,
          job.fileId,
        ],
      )
    } catch (error) {
      options.logError?.(error)
      await finish(job.fileId, 'FAILED', 'PROCESSING_ERROR').catch(() => undefined)
    } finally {
      await storage.removeTemp(job.tempPath).catch(() => undefined)
    }
  }

  return {
    storage,
    scanner,
    enqueue: (job) =>
      queue.push(async () => {
        await ready
        await run(job)
      }),
    idle: () => queue.idle(),
    async recover() {
      await ready
      const result = await execute(
        pool,
        `UPDATE file_objects
            SET processing_status = 'FAILED', failure_reason = 'INTERRUPTED',
                scan_status = IF(scan_status = 'PENDING', 'ERROR', scan_status),
                processed_at = UTC_TIMESTAMP(3)
          WHERE processing_status = 'PROCESSING'`,
      )
      await storage.clearTemp()
      return result.affectedRows
    },
  }
}
