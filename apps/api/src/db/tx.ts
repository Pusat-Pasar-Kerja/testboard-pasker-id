import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export type Db = Pool | PoolConnection

/** Run `work` in one transaction; commit on success, roll back on any error. */
export async function withTransaction<T>(
  pool: Pool,
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

/** Typed SELECT helper. Values are always bound as parameters (never interpolated). */
export async function select<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params)
  return rows as T[]
}

export async function selectOne<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  return (await select<T>(db, sql, params))[0] ?? null
}

export async function execute(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params)
  return result
}

/** BIGINT ids come back as strings (bigNumberStrings); insertId may be number for small ids. */
export function insertedId(result: ResultSetHeader): string {
  return String(result.insertId)
}

/** DATETIME(3) values are read as UTC Date objects; serialise as ISO 8601. */
export function iso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/** DATE columns (no time) as YYYY-MM-DD. */
export function isoDate(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** MariaDB 10.4 returns JSON columns as strings. */
export function parseJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return JSON.parse(value) as T
  return value as T
}

export function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'
}
