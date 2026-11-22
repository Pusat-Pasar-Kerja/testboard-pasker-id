import type { Pool } from 'mysql2/promise'
import { execute, selectOne } from '../db/tx.js'
import { sha256Hex } from '../lib/crypto.js'

/** Adaptive lockout (doc 09, TB-AUTH-002), persisted so a restart does not reset it. */
export const LOGIN_WINDOW_MINUTES = 15
export const MAX_FAILURES_PER_EMAIL = 5
export const MAX_FAILURES_PER_IP = 30

export function emailHash(email: string): string {
  return sha256Hex(email.trim().toLowerCase())
}

export async function isLoginBlocked(
  pool: Pool,
  email: string,
  ip: string | null,
): Promise<boolean> {
  const row = await selectOne<{ by_email: number; by_ip: number }>(
    pool,
    `SELECT
       SUM(email_hash = ?) AS by_email,
       SUM(? IS NOT NULL AND ip_address = ? AND email_hash <> SHA2('workshop-join', 256)) AS by_ip
     FROM auth_login_attempts
     WHERE succeeded = 0 AND attempted_at > UTC_TIMESTAMP(3) - INTERVAL ? MINUTE`,
    [emailHash(email), ip, ip, LOGIN_WINDOW_MINUTES],
  )
  return (
    Number(row?.by_email ?? 0) >= MAX_FAILURES_PER_EMAIL ||
    Number(row?.by_ip ?? 0) >= MAX_FAILURES_PER_IP
  )
}

export async function recordLoginAttempt(
  pool: Pool,
  email: string,
  ip: string | null,
  succeeded: boolean,
): Promise<void> {
  await execute(
    pool,
    'INSERT INTO auth_login_attempts (email_hash, ip_address, succeeded) VALUES (?, ?, ?)',
    [emailHash(email), ip, succeeded ? 1 : 0],
  )
}
