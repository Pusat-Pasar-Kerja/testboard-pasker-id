/**
 * Run the retention clean-up once, from the server shell (the API also runs it daily).
 *
 *   npm run maintenance -w @testboard/api -- --dry-run   show what would be removed
 *   npm run maintenance -w @testboard/api                remove it
 *
 * Uses the same settings as the API (TESTBOARD_ENV_FILE or apps/api/.env).
 */
import { loadConfig } from '../config/env.js'
import { loadEnvironment } from '../config/load-env.js'
import { createPool } from '../db/pool.js'
import { DEFAULT_RETENTION, runRetention } from './retention.js'

loadEnvironment()
const config = loadConfig(process.env)
if (!config.db) {
  console.error('[maintenance] database settings are missing')
  process.exit(1)
}
const pool = createPool(config.db)
try {
  const report = await runRetention(
    pool,
    config.storageDir,
    {
      ...DEFAULT_RETENTION,
      unusedFileDays: config.retention.unusedFileDays,
      importDays: config.retention.importDays,
    },
    { dryRun: process.argv.includes('--dry-run') },
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await pool.end()
}
