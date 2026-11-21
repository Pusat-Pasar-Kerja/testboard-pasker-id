import { existsSync } from 'node:fs'
import { readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { SiteSettings } from '@testboard/shared'
import type { Pool } from 'mysql2/promise'
import { execute, select } from '../db/tx.js'
import { LocalStorage } from '../files/storage.js'
import { writeSystemAudit } from '../lib/audit.js'

/**
 * Retention (ADR 0010, DEC-05/DEC-19). Owner decision 2026-11-20: uploads that were never
 * used anywhere are removed after 90 days; evidence that is attached to a result, bug,
 * test case or import is NEVER removed automatically. Backups are a separate script
 * (ops/backup.sh, 30 days).
 */
export interface RetentionPolicy {
  /** Unused uploads (not attached anywhere) older than this are deleted. */
  unusedFileDays: number
  /** Import work files (uploaded workbook + parsed copy) of jobs older than this are removed. */
  importDays: number
  /** Deleted files keep their bytes this long (undo window for mistakes), then bytes go. */
  deletedFileGraceDays: number
  /** Expired, idle or revoked sessions older than this are removed from the table. */
  sessionDays: number
  loginAttemptDays: number
  /** Quarantine leftovers (interrupted uploads) older than this are removed. */
  tempHours: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  unusedFileDays: 90,
  importDays: 90,
  deletedFileGraceDays: 7,
  sessionDays: 7,
  loginAttemptDays: 90,
  tempHours: 24,
}

export interface RetentionReport {
  dry_run: boolean
  unused_files_deleted: number
  files_purged: number
  bytes_freed: number
  import_folders_removed: number
  sessions_removed: number
  login_attempts_removed: number
  temp_files_removed: number
}

const DAY = 86_400_000
const BATCH = 500

const UNUSED = `f.deleted_at IS NULL
  AND f.processing_status <> 'PROCESSING'
  AND f.uploaded_at < ?
  AND NOT EXISTS (SELECT 1 FROM execution_files x WHERE x.file_object_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM defect_files x WHERE x.file_object_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM test_case_files x WHERE x.file_object_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM import_job_row_files x WHERE x.file_object_id = f.id)`

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

export async function runRetention(
  pool: Pool,
  storageRoot: string,
  policy: RetentionPolicy = DEFAULT_RETENTION,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<RetentionReport> {
  const now = options.now ?? new Date()
  const dryRun = options.dryRun ?? false
  const before = (days: number) => new Date(now.getTime() - days * DAY)
  const storage = new LocalStorage(storageRoot)
  const report: RetentionReport = {
    dry_run: dryRun,
    unused_files_deleted: 0,
    files_purged: 0,
    bytes_freed: 0,
    import_folders_removed: 0,
    sessions_removed: 0,
    login_attempts_removed: 0,
    temp_files_removed: 0,
  }

  // 1. Unused uploads -> deleted (soft), each with an audit record.
  const unusedCutoff = before(policy.unusedFileDays)
  for (;;) {
    const rows = await select<{ id: string; project_id: string; original_filename: string }>(
      pool,
      `SELECT f.id, f.project_id, f.original_filename FROM file_objects f WHERE ${UNUSED}
        ORDER BY f.id LIMIT ${BATCH}`,
      [unusedCutoff],
    )
    if (dryRun) {
      report.unused_files_deleted = rows.length
      break
    }
    for (const row of rows) {
      // Re-check "unused" in the same statement: a file attached a moment ago survives.
      const result = await execute(
        pool,
        `UPDATE file_objects f SET f.deleted_at = UTC_TIMESTAMP(3) WHERE f.id = ? AND ${UNUSED}`,
        [row.id, unusedCutoff],
      )
      if (result.affectedRows === 1) {
        report.unused_files_deleted += 1
        await writeSystemAudit(pool, {
          projectId: String(row.project_id),
          entityType: 'file',
          entityId: String(row.id),
          action: 'DELETE',
          newValues: { reason: 'RETENTION_UNUSED', days: policy.unusedFileDays },
        })
      }
    }
    if (rows.length < BATCH) break
  }

  // 2. Bytes of deleted files (manual or retention) after the grace period.
  const purgeCutoff = before(policy.deletedFileGraceDays)
  for (;;) {
    const rows = await select<{
      id: string
      object_key: string
      thumbnail_object_key: string | null
    }>(
      pool,
      `SELECT id, object_key, thumbnail_object_key FROM file_objects
        WHERE deleted_at IS NOT NULL AND deleted_at < ? AND storage_backend <> 'PURGED'
        ORDER BY id LIMIT ${BATCH}`,
      [purgeCutoff],
    )
    for (const row of rows) {
      for (const key of [row.object_key, row.thumbnail_object_key]) {
        if (!key) continue
        let path: string
        try {
          path = storage.pathOf(key)
        } catch {
          continue // never touch anything outside the objects folder
        }
        report.bytes_freed += await sizeOf(path)
        if (!dryRun) await rm(path, { force: true })
      }
      report.files_purged += 1
      if (!dryRun) {
        await execute(
          pool,
          "UPDATE file_objects SET storage_backend = 'PURGED', thumbnail_object_key = NULL WHERE id = ?",
          [row.id],
        )
      }
    }
    if (dryRun || rows.length < BATCH) break
  }

  // 3. Import work folders of old jobs (the job and its row results stay in the database).
  const importsDir = resolve(storageRoot, 'imports')
  if (existsSync(importsDir)) {
    const jobs = await select<{ id: string }>(
      pool,
      `SELECT id FROM import_jobs
        WHERE status_code <> 'IMPORTING' AND COALESCE(completed_at, created_at) < ?`,
      [before(policy.importDays)],
    )
    for (const job of jobs) {
      const dir = join(importsDir, String(job.id))
      if (!/^\d+$/.test(String(job.id)) || !existsSync(dir)) continue
      report.import_folders_removed += 1
      if (!dryRun) await rm(dir, { recursive: true, force: true })
    }
  }

  // 4. Sessions and login attempts.
  const sessionCutoff = before(policy.sessionDays)
  const attemptCutoff = before(policy.loginAttemptDays)
  if (dryRun) {
    const [s] = await select<{ n: number }>(
      pool,
      `SELECT COUNT(*) AS n FROM user_sessions
        WHERE expires_at < ? OR last_seen_at < ? OR revoked_at < ?`,
      [sessionCutoff, sessionCutoff, sessionCutoff],
    )
    const [a] = await select<{ n: number }>(
      pool,
      'SELECT COUNT(*) AS n FROM auth_login_attempts WHERE attempted_at < ?',
      [attemptCutoff],
    )
    report.sessions_removed = Number(s?.n ?? 0)
    report.login_attempts_removed = Number(a?.n ?? 0)
  } else {
    report.sessions_removed = (
      await execute(
        pool,
        'DELETE FROM user_sessions WHERE expires_at < ? OR last_seen_at < ? OR revoked_at < ?',
        [sessionCutoff, sessionCutoff, sessionCutoff],
      )
    ).affectedRows
    report.login_attempts_removed = (
      await execute(pool, 'DELETE FROM auth_login_attempts WHERE attempted_at < ?', [attemptCutoff])
    ).affectedRows
  }

  // 5. Quarantine leftovers.
  const tmpDir = join(storage.root, 'tmp')
  if (existsSync(tmpDir)) {
    const cutoff = now.getTime() - policy.tempHours * 3_600_000
    for (const name of await readdir(tmpDir)) {
      const path = join(tmpDir, name)
      try {
        const info = await stat(path)
        if (!info.isFile() || info.mtimeMs >= cutoff) continue
        report.temp_files_removed += 1
        if (!dryRun) await rm(path, { force: true })
      } catch {
        // vanished meanwhile
      }
    }
  }

  return report
}

/** Daily schedule inside the API process (first run a few minutes after start). */
/** Retention days chosen by the Super Admin (site settings), on top of the fixed rules. */
export function retentionPolicy(settings: SiteSettings): RetentionPolicy {
  return {
    ...DEFAULT_RETENTION,
    unusedFileDays: settings['retention.unused_file_days'],
    importDays: settings['retention.import_days'],
  }
}

export function scheduleRetention(
  pool: Pool,
  storageRoot: string,
  policy: () => Promise<RetentionPolicy>,
  log: (message: string) => void = console.log,
): () => void {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const report = await runRetention(pool, storageRoot, await policy())
      log(`[retention] ${JSON.stringify(report)}`)
    } catch (error) {
      console.error('[retention] failed', error)
    } finally {
      running = false
    }
  }
  const first = setTimeout(() => void run(), 5 * 60_000)
  const daily = setInterval(() => void run(), DAY)
  first.unref()
  daily.unref()
  return () => {
    clearTimeout(first)
    clearInterval(daily)
  }
}
