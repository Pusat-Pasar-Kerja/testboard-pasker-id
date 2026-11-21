import type { Pool } from 'mysql2/promise'
import { execute, selectOne, withTransaction } from '../db/tx.js'

/**
 * Permanent ("owner") Super Admin (ADR 0011). Only this server-side function - reachable
 * through `ops/testboard.sh protect-admin`, never over HTTP - can set or release the flag.
 * The website refuses to revoke or deactivate such an account, whoever asks.
 */
export async function setPermanentSuperAdmin(
  pool: Pool,
  email: string,
  permanent: boolean,
): Promise<string> {
  return withTransaction(pool, async (conn) => {
    const user = await selectOne<{ id: string }>(conn, 'SELECT id FROM users WHERE email = ?', [
      email,
    ])
    if (!user) throw new Error(`No account with e-mail ${email}`)
    const userId = String(user.id)
    if (permanent) {
      await execute(conn, 'UPDATE users SET is_active = 1 WHERE id = ?', [userId])
      await execute(
        conn,
        `INSERT INTO user_system_roles (user_id, role_code, is_permanent) VALUES (?, 'SUPER_ADMIN', 1)
         ON DUPLICATE KEY UPDATE is_permanent = 1`,
        [userId],
      )
    } else {
      await execute(
        conn,
        "UPDATE user_system_roles SET is_permanent = 0 WHERE user_id = ? AND role_code = 'SUPER_ADMIN'",
        [userId],
      )
    }
    await execute(
      conn,
      `INSERT INTO audit_logs (actor_id, entity_type, entity_id, action_code, new_values_json, request_id)
       VALUES (NULL, 'user', ?, 'UPDATE', ?, 'cli:protect-admin')`,
      [userId, JSON.stringify({ permanent_super_admin: permanent })],
    )
    return userId
  })
}
