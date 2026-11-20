import type { Context } from 'hono'
import type { AppEnv } from '../types.js'
import { execute, type Db } from '../db/tx.js'

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'ARCHIVE'
  | 'IMPORT'
  | 'DOWNLOAD'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'

const SECRET_KEYS = /password|token|secret|cookie|hash/i

/** Remove secrets before anything reaches audit_logs (doc 09 section 7). */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SECRET_KEYS.test(key) ? '[REDACTED]' : redact(v),
      ]),
    )
  }
  return value
}

/**
 * Append an audit record. Call it with the same connection as the change itself so the
 * audit row commits or rolls back together with the data.
 */
export async function writeAudit(
  db: Db,
  c: Context<AppEnv>,
  entry: {
    projectId: string | null
    entityType: string
    entityId: string
    action: AuditAction
    oldValues?: unknown
    newValues?: unknown
  },
): Promise<void> {
  const auth = c.get('auth')
  const forwarded = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
  await execute(
    db,
    `INSERT INTO audit_logs
       (project_id, actor_id, entity_type, entity_id, action_code, old_values_json,
        new_values_json, request_id, client_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.projectId,
      auth?.userId ?? null,
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.oldValues === undefined ? null : JSON.stringify(redact(entry.oldValues)),
      entry.newValues === undefined ? null : JSON.stringify(redact(entry.newValues)),
      c.get('requestId') ?? null,
      (forwarded ?? '').slice(0, 45) || null,
    ],
  )
}
