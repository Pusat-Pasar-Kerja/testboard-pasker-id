import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import mysql from 'mysql2/promise'

/**
 * Builds a fresh `testboard_test` database on the LOCAL instance before integration tests:
 * baseline schema + all migrations, and CRUD-only grants for the dev app user (same shape
 * as production). The developer's `testboard` database is never touched by tests.
 */
export const TEST_DATABASE = 'testboard_test'

const repoRoot = new URL('../../../../', import.meta.url)

function readCnf(): Record<string, string> {
  const file = new URL('.local-db/root-client.cnf', repoRoot)
  if (!existsSync(file)) throw new Error('Local database not initialised. Run: npm run db:init')
  const values: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([a-z_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2]
  }
  return values
}

export default async function setup() {
  // Evidence written by earlier test runs (gitignored, on the repo drive).
  rmSync(new URL('.private-storage/test/', repoRoot), { recursive: true, force: true })
  const cnf = readCnf()
  if (!['127.0.0.1', 'localhost'].includes(cnf.host ?? '')) {
    throw new Error('Integration tests only run against the local database.')
  }
  const conn = await mysql.createConnection({
    host: cnf.host,
    port: Number(cnf.port),
    user: cnf.user,
    password: cnf.password,
    multipleStatements: true,
  })
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`)
    await conn.query(
      `CREATE DATABASE ${TEST_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    )
    await conn.query(`USE ${TEST_DATABASE}`)
    const baseline = readFileSync(
      new URL('database/baseline/schema_baseline_reference.sql', repoRoot),
      'utf8',
    ).replace(/^USE\s+`?testboard`?\s*;/im, '')
    await conn.query(baseline)
    const migrations = new URL('database/migrations/', repoRoot)
    for (const name of readdirSync(migrations)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await conn.query(readFileSync(new URL(name, migrations), 'utf8'))
    }
    for (const host of ['127.0.0.1', 'localhost']) {
      await conn.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${TEST_DATABASE}.* TO 'testboard_dev'@'${host}'`,
      )
    }
  } finally {
    await conn.end()
  }
}
