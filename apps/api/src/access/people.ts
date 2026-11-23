import type { Context } from 'hono'
import type { PoolConnection } from 'mysql2/promise'
import { execute, insertedId, isDuplicateKey, selectOne } from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { AppError } from '../lib/errors.js'
import type { AppEnv } from '../types.js'

/**
 * Find the person with this e-mail, or create their account when a name is given (owner,
 * 2026-11-24: "isian kelompok ngisi nama sama email, otomatis jadi user"). A new account has
 * no password until the person activates it, with a link from an Admin or at their table.
 */
export async function findOrCreatePerson(
  conn: PoolConnection,
  c: Context<AppEnv>,
  input: { email: string; display_name?: string | undefined },
): Promise<{ userId: string; created: boolean }> {
  const user = await selectOne<{ id: string; auth_provider: string }>(
    conn,
    'SELECT id, auth_provider FROM users WHERE email = ? FOR UPDATE',
    [input.email],
  )
  if (user) {
    if (user.auth_provider === 'WORKSHOP') {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'email', message: 'NOT_A_PERSON' },
      ])
    }
    return { userId: String(user.id), created: false }
  }
  if (!input.display_name) {
    // The web then asks for the person's name to create the account.
    throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
      { field: 'email', message: 'NO_ACCOUNT' },
    ])
  }
  try {
    const result = await execute(
      conn,
      `INSERT INTO users (display_name, email, password_hash, auth_provider, preferred_locale)
       VALUES (?, ?, NULL, 'LOCAL', 'id')`,
      [input.display_name, input.email],
    )
    const userId = insertedId(result)
    await writeAudit(conn, c, {
      projectId: null,
      entityType: 'user',
      entityId: userId,
      action: 'CREATE',
      newValues: { email: input.email, display_name: input.display_name, activated: false },
    })
    return { userId, created: true }
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(409, 'CONFLICT', 'An account with this e-mail already exists.', [
        { field: 'email', message: 'Already used' },
      ])
    }
    throw error
  }
}

/**
 * Make sure a person listed at a table can open the project as a Penguji. Existing tasks are
 * kept, and Admins / Super Admins need no membership (ADR 0017).
 */
export async function ensureProjectTask(
  conn: PoolConnection,
  c: Context<AppEnv>,
  projectId: string,
  userId: string,
): Promise<void> {
  const existing = await selectOne(
    conn,
    `SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
     UNION ALL
     SELECT 1 FROM user_system_roles WHERE user_id = ? AND role_code IN ('SUPER_ADMIN', 'ADMIN')
     LIMIT 1`,
    [projectId, userId, userId],
  )
  if (existing) return
  await execute(
    conn,
    "INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, 'TESTER')",
    [projectId, userId],
  )
  await writeAudit(conn, c, {
    projectId,
    entityType: 'project_member',
    entityId: userId,
    action: 'CREATE',
    newValues: { role_code: 'TESTER', via: 'workshop_table' },
  })
}

/** "budi.santoso@gmail.com" -> "b***@gmail.com": enough for a member to recognise it. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.slice(0, 1)}***${email.slice(at)}`
}
