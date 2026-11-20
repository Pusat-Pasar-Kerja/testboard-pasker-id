/**
 * Create (or promote) a Super Admin account from the server command line (ADR 0004).
 * Never exposed over HTTP. Uses the API's database settings (apps/api/.env).
 *
 *   npm run admin:create-super -w @testboard/api -- --email admin@example.go.id --name "Nama Admin"
 *   ... --reset-password   also issue a new temporary password for an existing account
 *
 * The temporary password is printed ONCE and stored only as an Argon2id hash.
 */
import { parseArgs } from 'node:util'
import { emailSchema } from '@testboard/shared'
import { hashPassword } from '../src/auth/passwords.js'
import { revokeUserSessions } from '../src/auth/sessions.js'
import { loadConfig } from '../src/config/env.js'
import { loadEnvironment } from '../src/config/load-env.js'
import { createPool } from '../src/db/pool.js'
import { execute, insertedId, selectOne, withTransaction } from '../src/db/tx.js'
import { temporaryPassword } from '../src/lib/crypto.js'

loadEnvironment()

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
  },
})

const email = emailSchema.safeParse(values.email ?? '')
if (!email.success || (!values.name && !values['reset-password'])) {
  console.error('Usage: --email <address> --name "<display name>" [--reset-password]')
  process.exit(1)
}

const config = loadConfig(process.env)
if (!config.db) {
  console.error('Database settings (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are required.')
  process.exit(1)
}

const pool = createPool(config.db)
try {
  const password = temporaryPassword()
  const passwordHash = await hashPassword(password)
  const outcome = await withTransaction(pool, async (conn) => {
    const existing = await selectOne<{ id: string }>(conn, 'SELECT id FROM users WHERE email = ?', [
      email.data,
    ])
    let userId: string
    let issuedPassword = false
    if (existing) {
      userId = String(existing.id)
      await execute(conn, 'UPDATE users SET is_active = 1 WHERE id = ?', [userId])
      if (values['reset-password']) {
        await execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', [
          passwordHash,
          userId,
        ])
        await revokeUserSessions(conn, userId)
        issuedPassword = true
      }
    } else {
      const result = await execute(
        conn,
        `INSERT INTO users (display_name, email, password_hash, auth_provider)
         VALUES (?, ?, ?, 'LOCAL')`,
        [values.name, email.data, passwordHash],
      )
      userId = insertedId(result)
      issuedPassword = true
    }
    await execute(
      conn,
      `INSERT IGNORE INTO user_system_roles (user_id, role_code) VALUES (?, 'SUPER_ADMIN')`,
      [userId],
    )
    await execute(
      conn,
      `INSERT INTO audit_logs (actor_id, entity_type, entity_id, action_code, new_values_json, request_id)
       VALUES (NULL, 'user', ?, 'UPDATE', ?, 'cli:create-super-admin')`,
      [userId, JSON.stringify({ granted: 'SUPER_ADMIN', email: email.data })],
    )
    return { userId, created: !existing, issuedPassword }
  })

  console.log(
    `[admin] ${outcome.created ? 'Created' : 'Updated'} Super Admin ${email.data} (id ${outcome.userId}).`,
  )
  if (outcome.issuedPassword) {
    console.log('[admin] Temporary password (shown once, change it after first login):')
    console.log(`        ${password}`)
  }
} finally {
  await pool.end()
}
