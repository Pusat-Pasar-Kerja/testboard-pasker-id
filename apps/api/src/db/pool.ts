import mysql, { type Pool } from 'mysql2/promise'

export interface DbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  connectionLimit: number
}

export type DatabaseHealth = 'up' | 'down' | 'not_configured'

/**
 * Connection pool for MariaDB 10.4 (ADR 0003/0004).
 * - BIGINT ids come back as strings (no JS precision loss).
 * - Every connection runs in UTC: the VPS server uses time_zone=SYSTEM, so without this
 *   CURRENT_TIMESTAMP defaults would follow the OS zone. UI converts to Asia/Jakarta.
 * - Always use placeholders (`?`) - never interpolate values into SQL.
 */
export function createPool(config: DbConfig): Pool {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionLimit: config.connectionLimit,
    waitForConnections: true,
    connectTimeout: 5_000,
    enableKeepAlive: true,
    charset: 'utf8mb4_general_ci',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    // mysql2 sets IGNORE_SPACE by default, which would change the session sql_mode away
    // from the VPS server's; drop it so behaviour matches DBeaver/production exactly.
    flags: ['-IGNORE_SPACE'],
  })
  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'")
  })
  return pool
}

/** Cheap liveness probe with a hard timeout so /health never hangs. */
export async function pingDatabase(pool: Pool, timeoutMs = 2_000): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      }),
    ])
    return 'up'
  } catch {
    return 'down'
  } finally {
    clearTimeout(timer)
  }
}
