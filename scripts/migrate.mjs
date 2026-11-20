#!/usr/bin/env node
/**
 * Forward-only migration runner for database/migrations/NNNN_*.sql (MariaDB 10.4).
 *
 *   npm run db:migrate            apply pending migrations to the LOCAL dev database
 *   npm run db:migrate -- --status  list applied / pending, change nothing
 *
 * Connection: by default the local instance's root client file (.local-db/root-client.cnf).
 * Any other target needs MIGRATION_DB_HOST/PORT/USER/PASSWORD/NAME *and* the --yes flag,
 * and must only ever be run on the server itself after a backup (Milestone 7 procedure).
 *
 * Every applied file is recorded with its SHA-256 in schema_migrations; a file that changed
 * after being applied is refused. MariaDB DDL auto-commits, so files must stay small and
 * idempotent (CREATE TABLE IF NOT EXISTS ...).
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(repoRoot, 'database', 'migrations')
const LOCAL_CNF = join(repoRoot, '.local-db', 'root-client.cnf')
const args = new Set(process.argv.slice(2))

function fail(message) {
  console.error(`[migrate] ${message}`)
  process.exit(1)
}

function readCnf(file) {
  const values = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([a-z_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (match) values[match[1]] = match[2]
  }
  return values
}

function connectionOptions() {
  if (process.env.MIGRATION_DB_HOST) {
    if (!args.has('--yes')) {
      fail('Remote/explicit target requires --yes (take a backup first). Refusing.')
    }
    return {
      label: `${process.env.MIGRATION_DB_HOST}:${process.env.MIGRATION_DB_PORT ?? 3306}`,
      host: process.env.MIGRATION_DB_HOST,
      port: Number(process.env.MIGRATION_DB_PORT ?? 3306),
      user: process.env.MIGRATION_DB_USER,
      password: process.env.MIGRATION_DB_PASSWORD,
      database: process.env.MIGRATION_DB_NAME ?? 'testboard',
    }
  }
  if (!existsSync(LOCAL_CNF)) fail('Local database not initialised. Run: npm run db:init')
  const cnf = readCnf(LOCAL_CNF)
  return {
    label: `local ${cnf.host}:${cnf.port}`,
    host: cnf.host,
    port: Number(cnf.port),
    user: cnf.user,
    password: cnf.password,
    database: 'testboard',
  }
}

function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS, name), 'utf8')
      return {
        version: name.replace(/\.sql$/, ''),
        sql,
        checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
      }
    })
}

const options = connectionOptions()
const db = await mysql.createConnection({
  host: options.host,
  port: options.port,
  user: options.user,
  password: options.password,
  database: options.database,
  multipleStatements: true,
  flags: ['-IGNORE_SPACE'],
})

try {
  await db.query("SET time_zone = '+00:00'")
  const files = migrationFiles()
  const [tables] = await db.query("SHOW TABLES LIKE 'schema_migrations'")
  const applied = new Map()
  if (tables.length > 0) {
    const [rows] = await db.query('SELECT version, checksum FROM schema_migrations')
    for (const row of rows) applied.set(row.version, row.checksum)
  }

  for (const file of files) {
    const known = applied.get(file.version)
    if (known && known !== file.checksum) {
      fail(`${file.version} changed after it was applied. Create a new migration instead.`)
    }
  }
  const pending = files.filter((f) => !applied.has(f.version))
  console.log(`[migrate] target: ${options.label}/${options.database}`)
  console.log(`[migrate] applied: ${applied.size}, pending: ${pending.length}`)
  for (const file of pending) console.log(`  - ${file.version}`)
  if (args.has('--status') || pending.length === 0) process.exit(0)

  for (const file of pending) {
    await db.query(file.sql)
    await db.query(
      'INSERT INTO schema_migrations (version, checksum, applied_by) VALUES (?, ?, CURRENT_USER())',
      [file.version, file.checksum],
    )
    console.log(`[migrate] applied ${file.version}`)
  }
  console.log('[migrate] done')
} finally {
  await db.end()
}
