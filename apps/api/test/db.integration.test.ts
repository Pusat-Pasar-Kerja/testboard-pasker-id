import type { Pool, RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPool, pingDatabase } from '../src/db/pool.js'
import { testConfig } from './support/harness.js'

/**
 * Runs against the LOCAL MariaDB instance (throwaway `testboard_test` database built by
 * global-setup). Verifies the assumptions the backend relies on (ADR 0003/0004).
 */
const config = testConfig()

let pool: Pool

beforeAll(() => {
  pool = createPool(config.db!)
})
afterAll(async () => {
  await pool.end()
})

describe('local database (mirrors VPS MariaDB 10.4.32)', () => {
  it('is reachable', async () => {
    expect(await pingDatabase(pool)).toBe('up')
  })

  it('runs the same engine and server settings as the VPS', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT VERSION() AS version, @@GLOBAL.sql_mode AS server_mode,
              @@SESSION.sql_mode AS session_mode, @@collation_server AS collation`,
    )
    const vpsMode =
      'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'
    expect(rows[0]?.version).toMatch(/^10\.4\.32-MariaDB/)
    expect(rows[0]?.server_mode).toBe(vpsMode)
    // The app session must not drift from the server mode (no client-added IGNORE_SPACE).
    expect(rows[0]?.session_mode).toBe(vpsMode)
    expect(rows[0]?.collation).toBe('utf8mb4_general_ci')
  })

  it('forces UTC on every pooled connection', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        pool.query<RowDataPacket[]>('SELECT @@session.time_zone AS tz'),
      ),
    )
    for (const [rows] of results) expect(rows[0]?.tz).toBe('+00:00')
  })

  it('returns BIGINT values as strings without precision loss', async () => {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT CAST(? AS UNSIGNED) AS big', [
      '18446744073709551615',
    ])
    expect(rows[0]?.big).toBe('18446744073709551615')
  })

  it('has the baseline schema plus migrations and the latest-status view', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT SUM(table_type = 'BASE TABLE') AS tables, SUM(table_type = 'VIEW') AS views
         FROM information_schema.tables WHERE table_schema = DATABASE()`,
    )
    // 27 baseline tables + 5 (migrations 0001-0005) + 2 (0008 account recovery)
    // + 4 (0012 workshop: features, tables, table modules, confirmations)
    // + 1 (0014 people at a table).
    expect(Number(rows[0]?.tables)).toBe(27 + 5 + 2 + 4 + 1)
    expect(Number(rows[0]?.views)).toBe(1)
  })

  it('app user has CRUD only (no DDL), like testboard_app in production', async () => {
    await expect(pool.query('CREATE TABLE tb_should_fail (id INT)')).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    })
  })
})
