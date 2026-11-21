/**
 * Make an existing account the permanent Super Admin (ADR 0011), from the server only.
 * The website can then never revoke or deactivate it.
 *
 *   npm run admin:protect -w @testboard/api -- --email owner@example.go.id
 *   ... --release     remove the protection again (e.g. hand-over to a new owner)
 *
 * On the VPS: bash ops/testboard.sh protect-admin --email owner@example.go.id
 */
import { parseArgs } from 'node:util'
import { emailSchema } from '@testboard/shared'
import { setPermanentSuperAdmin } from '../src/auth/owner.js'
import { loadConfig } from '../src/config/env.js'
import { loadEnvironment } from '../src/config/load-env.js'
import { createPool } from '../src/db/pool.js'

loadEnvironment()

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    release: { type: 'boolean', default: false },
  },
})

const email = emailSchema.safeParse(values.email ?? '')
if (!email.success) {
  console.error('Usage: --email <address> [--release]')
  process.exit(1)
}

const config = loadConfig(process.env)
if (!config.db) {
  console.error('Database settings (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are required.')
  process.exit(1)
}

const pool = createPool(config.db)
try {
  const userId = await setPermanentSuperAdmin(pool, email.data, !values.release)
  console.log(
    values.release
      ? `[admin] Permanent protection removed from ${email.data} (id ${userId}); still a Super Admin.`
      : `[admin] ${email.data} (id ${userId}) is now the permanent Super Admin.`,
  )
} catch (error) {
  console.error(`[admin] ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  await pool.end()
}
