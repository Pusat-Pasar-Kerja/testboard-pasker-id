import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config/env.js'
import { loadEnvironment } from './config/load-env.js'
import { createPool, pingDatabase } from './db/pool.js'
import { createFileService } from './files/pipeline.js'
import { DEFAULT_RETENTION, scheduleRetention } from './maintenance/retention.js'

// TESTBOARD_ENV_FILE on the server (outside the web root); apps/api/.env in development.
loadEnvironment()

const config = loadConfig(process.env)
const pool = config.db ? createPool(config.db) : null
const files = pool
  ? createFileService(pool, config, { logError: (error) => console.error('[files]', error) })
  : undefined
if (pool && files) {
  // Uploads interrupted by a restart are failed, never silently released.
  const interrupted = await files.recover()
  // An import being applied when the process stopped: its transaction was rolled back.
  await pool.query(
    `UPDATE import_jobs SET status_code = 'FAILED', error_summary = '{"failure":"INTERRUPTED"}',
            completed_at = UTC_TIMESTAMP(3) WHERE status_code = 'IMPORTING'`,
  )
  if (interrupted > 0)
    console.log(`[testboard-api] ${interrupted} interrupted upload(s) marked FAILED`)
}
const app = createApp({
  config,
  pool,
  files,
  checkDatabase: pool ? () => pingDatabase(pool) : undefined,
})

const stopRetention =
  pool && config.retention.enabled
    ? scheduleRetention(pool, config.storageDir, {
        ...DEFAULT_RETENTION,
        unusedFileDays: config.retention.unusedFileDays,
        importDays: config.retention.importDays,
      })
    : () => {}

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `[testboard-api] listening on http://${info.address}:${info.port} (${config.nodeEnv})`,
  )
})

function shutdown(signal: string) {
  console.log(`[testboard-api] ${signal} received, shutting down`)
  stopRetention()
  server.close(() => {
    // Let evidence already being processed finish before the pool closes.
    void (files ? files.idle() : Promise.resolve())
      .then(() => (pool ? pool.end() : undefined))
      .finally(() => process.exit(0))
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
