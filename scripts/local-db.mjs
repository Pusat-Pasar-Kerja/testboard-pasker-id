#!/usr/bin/env node
/**
 * Local development database WITHOUT Docker (ADR 0003).
 *
 * Runs a SEPARATE MariaDB instance from the XAMPP binaries (same 10.4.32 engine as the VPS)
 * with its own data directory inside this repo (.local-db/, git-ignored) on 127.0.0.1:3307.
 * It never touches XAMPP's own data directory or the VPS.
 *
 *   npm run db:init     create data dir, settings, database, dev user, import baseline schema
 *   npm run db:start    start the instance in the background
 *   npm run db:stop     stop it
 *   npm run db:status   show version, settings and table count
 *   (npm run dev starts it automatically when it is set up)
 *
 * Env overrides: MARIADB_BIN (default C:\xampp\mysql\bin), TESTBOARD_LOCAL_DB_DIR, TESTBOARD_LOCAL_DB_PORT.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = process.env.MARIADB_BIN ?? 'C:\\xampp\\mysql\\bin'
const BASE = resolve(process.env.TESTBOARD_LOCAL_DB_DIR ?? join(repoRoot, '.local-db'))
const DATA = join(BASE, 'data')
const PORT = Number(process.env.TESTBOARD_LOCAL_DB_PORT ?? 3307)
const ROOT_CNF = join(BASE, 'root-client.cnf')
const LOG = join(BASE, 'mysqld.log')
const API_ENV = join(repoRoot, 'apps', 'api', '.env')
const BASELINE = join(repoRoot, 'database', 'baseline', 'schema_baseline_reference.sql')
const exe = (name) => join(BIN, process.platform === 'win32' ? `${name}.exe` : name)

// Mirror the VPS server settings (SELECT @@sql_mode, @@character_set_server, @@collation_server).
const SERVER_SETTINGS = `
[mysqld]
bind-address=127.0.0.1
character-set-server=utf8mb4
collation-server=utf8mb4_general_ci
sql_mode=STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION
`

function fail(message) {
  console.error(`[db] ${message}`)
  process.exit(1)
}

function secret() {
  return randomBytes(18).toString('base64url')
}

function portOpen(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.end()
      done(true)
    })
    socket.once('error', () => done(false))
  })
}

async function waitForPort(open, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if ((await portOpen(PORT)) === open) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** Run SQL as local root through the client options file (password never on the command line). */
function sql(statements, { database } = {}) {
  const args = [`--defaults-extra-file=${ROOT_CNF}`, '--batch', '--skip-column-names']
  if (database) args.push(database)
  const result = spawnSync(exe('mysql'), args, { input: statements, encoding: 'utf8' })
  if (result.status !== 0) fail(`SQL failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

async function start() {
  if (!existsSync(join(DATA, 'my.ini'))) fail('Not initialised yet. Run: npm run db:init')
  if (await portOpen(PORT)) {
    console.log(`[db] already running on 127.0.0.1:${PORT}`)
    return
  }
  const log = openSync(LOG, 'a')
  const child = spawn(exe('mysqld'), [`--defaults-file=${join(DATA, 'my.ini')}`, '--console'], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  })
  child.unref()
  if (!(await waitForPort(true))) fail(`server did not start; see ${LOG}`)
  console.log(`[db] MariaDB running on 127.0.0.1:${PORT} (data: ${DATA})`)
}

async function stop() {
  if (!(await portOpen(PORT))) {
    console.log('[db] not running')
    return
  }
  const result = spawnSync(exe('mysqladmin'), [`--defaults-extra-file=${ROOT_CNF}`, 'shutdown'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) fail(`shutdown failed: ${result.stderr.trim()}`)
  await waitForPort(false)
  console.log('[db] stopped')
}

async function status() {
  if (!(await portOpen(PORT))) {
    console.log(`[db] not running on 127.0.0.1:${PORT}. Start with: npm run db:start`)
    return
  }
  console.log(
    sql(`SELECT CONCAT('version: ', VERSION());
SELECT CONCAT('sql_mode: ', @@sql_mode);
SELECT CONCAT('charset/collation: ', @@character_set_server, ' / ', @@collation_server);
SELECT CONCAT('tables: ', SUM(table_type='BASE TABLE'), ', views: ', SUM(table_type='VIEW'))
  FROM information_schema.tables WHERE table_schema='testboard';`),
  )
}

async function init() {
  if (!existsSync(exe('mysql_install_db'))) {
    fail(`MariaDB binaries not found in ${BIN}. Set MARIADB_BIN to the folder with mysqld.exe.`)
  }
  if (existsSync(DATA)) fail(`${DATA} already exists - already initialised (use db:start).`)
  if (await portOpen(PORT)) fail(`port ${PORT} is already in use`)
  mkdirSync(BASE, { recursive: true })

  const rootPassword = secret()
  const devPassword = secret()
  const install = spawnSync(
    exe('mysql_install_db'),
    [`--datadir=${DATA}`, `--port=${PORT}`, `--password=${rootPassword}`, '--silent'],
    { encoding: 'utf8' },
  )
  if (install.status !== 0) fail(`mysql_install_db failed: ${install.stderr || install.stdout}`)
  appendFileSync(join(DATA, 'my.ini'), SERVER_SETTINGS)
  writeFileSync(
    ROOT_CNF,
    `[client]\nuser=root\npassword=${rootPassword}\nhost=127.0.0.1\nport=${PORT}\n`,
  )

  await start()

  // Dev app user mirrors production 'testboard_app': CRUD only, no DDL (migrations run as root).
  sql(`CREATE DATABASE IF NOT EXISTS testboard CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'testboard_dev'@'127.0.0.1' IDENTIFIED BY '${devPassword}';
CREATE USER 'testboard_dev'@'localhost' IDENTIFIED BY '${devPassword}';
GRANT SELECT, INSERT, UPDATE, DELETE ON testboard.* TO 'testboard_dev'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON testboard.* TO 'testboard_dev'@'localhost';
FLUSH PRIVILEGES;`)
  sql(readFileSync(BASELINE, 'utf8'), { database: 'testboard' })

  if (existsSync(API_ENV)) {
    console.log(`[db] ${API_ENV} exists; not modified. Set DB_* there manually (see .env.example).`)
  } else {
    const example = readFileSync(join(repoRoot, 'apps', 'api', '.env.example'), 'utf8')
    writeFileSync(
      API_ENV,
      `${example}\n# --- written by npm run db:init (local only, git-ignored) ---\nDB_HOST=127.0.0.1\nDB_PORT=${PORT}\nDB_NAME=testboard\nDB_USER=testboard_dev\nDB_PASSWORD=${devPassword}\n`,
    )
    console.log(`[db] wrote local DB settings to apps/api/.env (git-ignored)`)
  }
  await status()
  console.log('[db] done. Local passwords are stored only in .local-db/ and apps/api/.env.')
}

/** Used by `npm run dev`: start the DB if it is set up, otherwise just explain and continue. */
async function ensure() {
  if (!existsSync(join(DATA, 'my.ini'))) {
    console.log('[db] local database not set up (npm run db:init); continuing without it.')
    return
  }
  if (await portOpen(PORT)) return
  await start()
}

const commands = { init, start, stop, status, ensure }
const command = commands[process.argv[2] ?? '']
if (!command) fail('usage: node scripts/local-db.mjs <init|start|stop|status|ensure>')
await command()
