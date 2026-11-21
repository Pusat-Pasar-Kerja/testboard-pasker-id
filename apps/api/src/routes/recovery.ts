import {
  recoveryRequestSchema,
  recoveryRequestUpdateSchema,
  RECOVERY_STATUSES,
  resetLinkIssueSchema,
  resetPasswordSchema,
  resetTokenSchema,
  type RecoveryKind,
  type RecoveryRequestDto,
  type RecoveryStatus,
  type RecoverySummary,
  type ResetLinkCheck,
  type ResetLinkDto,
  type ResetLinkProblem,
} from '@testboard/shared'
import { Hono } from 'hono'
import type { Pool } from 'mysql2/promise'
import { emailHash } from '../auth/login-attempts.js'
import { requireSuperAdmin } from '../auth/middleware.js'
import { hashPassword } from '../auth/passwords.js'
import { clientIp, revokeUserSessions } from '../auth/sessions.js'
import {
  execute,
  insertedId,
  iso,
  isDuplicateKey,
  select,
  selectOne,
  withTransaction,
  type Db,
} from '../db/tx.js'
import { writeAudit } from '../lib/audit.js'
import { randomToken, sha256Hex } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { idParam, parseBody } from '../lib/validation.js'
import type { SettingsService } from '../settings/service.js'
import type { AppEnv } from '../types.js'

/**
 * Account recovery (ADR 0012): public "forgot e-mail / password" requests to the
 * administrators, and single-use reset links that only a Super Admin can issue.
 */

/** New requests from one network address per hour (duplicates are merged, not counted). */
export const MAX_REQUESTS_PER_IP_PER_HOUR = 5

const ACTIVE_LINK = 'l.active_user_id IS NOT NULL AND l.expires_at > UTC_TIMESTAMP(3)'

interface LinkRow {
  id: string
  user_id: string
  display_name: string
  email: string
  issued_at: Date
  expires_at: Date
  issued_by: string | null
  issuer_name: string | null
  request_id: string | null
}

async function resetLinks(db: Db, where: string, params: unknown[] = []): Promise<ResetLinkDto[]> {
  const rows = await select<LinkRow>(
    db,
    `SELECT l.id, l.user_id, u.display_name, u.email, l.issued_at, l.expires_at, l.issued_by,
            i.display_name AS issuer_name, l.request_id
       FROM password_reset_links l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN users i ON i.id = l.issued_by
      WHERE ${where}
      ORDER BY l.expires_at
      LIMIT 500`,
    params,
  )
  return rows.map((row) => ({
    id: String(row.id),
    user: { id: String(row.user_id), display_name: row.display_name, email: row.email },
    issued_at: iso(row.issued_at) as string,
    expires_at: iso(row.expires_at) as string,
    issued_by: row.issued_by
      ? { id: String(row.issued_by), display_name: row.issuer_name ?? '' }
      : null,
    request_id: row.request_id === null ? null : String(row.request_id),
  }))
}

interface RequestRow {
  id: string
  request_kind: RecoveryKind
  status_code: RecoveryStatus
  submitted_name: string
  submitted_email: string | null
  contact_info: string | null
  message_text: string | null
  submit_count: number
  created_at: Date
  last_submitted_at: Date
  user_id: string | null
  user_name: string | null
  user_email: string | null
  user_active: number | null
  user_permanent: number | null
  handled_by: string | null
  handler_name: string | null
  handled_at: Date | null
  resolution_note: string | null
}

async function recoveryRequests(
  db: Db,
  filter: { status?: RecoveryStatus; id?: string },
): Promise<RecoveryRequestDto[]> {
  const rows = await select<RequestRow>(
    db,
    `SELECT r.id, r.request_kind, r.status_code, r.submitted_name, r.submitted_email,
            r.contact_info, r.message_text, r.submit_count, r.created_at, r.last_submitted_at,
            r.user_id, u.display_name AS user_name, u.email AS user_email,
            u.is_active AS user_active,
            EXISTS (SELECT 1 FROM user_system_roles s
                     WHERE s.user_id = r.user_id AND s.role_code = 'SUPER_ADMIN'
                       AND s.is_permanent = 1) AS user_permanent,
            r.handled_by, h.display_name AS handler_name, r.handled_at, r.resolution_note
       FROM account_recovery_requests r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN users h ON h.id = r.handled_by
      WHERE (? IS NULL OR r.status_code = ?) AND (? IS NULL OR r.id = ?)
      ORDER BY r.status_code = 'OPEN' DESC, r.last_submitted_at DESC, r.id DESC
      LIMIT 200`,
    [filter.status ?? null, filter.status ?? null, filter.id ?? null, filter.id ?? null],
  )
  const userIds = [...new Set(rows.flatMap((row) => (row.user_id ? [String(row.user_id)] : [])))]
  const links = userIds.length
    ? await resetLinks(
        db,
        `${ACTIVE_LINK} AND l.user_id IN (${userIds.map(() => '?').join(', ')})`,
        [...userIds],
      )
    : []
  const linkByUser = new Map(links.map((link) => [link.user.id, link]))
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.request_kind,
    status: row.status_code,
    name: row.submitted_name,
    email: row.submitted_email,
    contact: row.contact_info,
    message: row.message_text,
    submit_count: Number(row.submit_count),
    created_at: iso(row.created_at) as string,
    last_submitted_at: iso(row.last_submitted_at) as string,
    user:
      row.user_id && row.user_email !== null
        ? {
            id: String(row.user_id),
            display_name: row.user_name ?? '',
            email: row.user_email,
            is_active: Number(row.user_active) === 1,
            is_permanent: Number(row.user_permanent) === 1,
          }
        : null,
    active_link: row.user_id ? (linkByUser.get(String(row.user_id)) ?? null) : null,
    handled_by: row.handled_by
      ? { id: String(row.handled_by), display_name: row.handler_name ?? '' }
      : null,
    handled_at: iso(row.handled_at),
    note: row.resolution_note,
  }))
}

/** Links whose time ran out no longer count as "active" (frees the one-per-account slot). */
async function releaseExpiredLinks(db: Db, userId: string) {
  await execute(
    db,
    `UPDATE password_reset_links SET active_user_id = NULL
      WHERE active_user_id = ? AND expires_at <= UTC_TIMESTAMP(3)`,
    [userId],
  )
}

function invalidLink(problem: ResetLinkProblem): never {
  throw new AppError(404, 'NOT_FOUND', 'This reset link cannot be used.', [
    { field: 'token', message: problem },
  ])
}

interface TokenRow {
  id: string
  user_id: string
  active_user_id: string | null
  used_at: Date | null
  revoked_at: Date | null
  expired: number
  issued_at: Date
  expires_at: Date
  email: string
  display_name: string
  is_active: number
}

/** The link behind a token, or a 404 that says why it cannot be used. */
async function usableLink(db: Db, token: string, forUpdate = false): Promise<TokenRow> {
  const row = await selectOne<TokenRow>(
    db,
    `SELECT l.id, l.user_id, l.active_user_id, l.used_at, l.revoked_at,
            l.expires_at <= UTC_TIMESTAMP(3) AS expired, l.issued_at, l.expires_at,
            u.email, u.display_name, u.is_active
       FROM password_reset_links l JOIN users u ON u.id = l.user_id
      WHERE l.token_hash = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [sha256Hex(token)],
  )
  if (!row) invalidLink('INVALID')
  if (row.used_at) invalidLink('USED')
  if (row.revoked_at) invalidLink('REVOKED')
  if (Number(row.expired) === 1 || row.active_user_id === null) invalidLink('EXPIRED')
  if (Number(row.is_active) !== 1) invalidLink('INVALID')
  return row
}

/** Signed-out endpoints: send a request, open a reset link, set the new password. */
export function recoveryPublicRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>()

  routes.post('/auth/recovery-requests', async (c) => {
    const input = await parseBody(c, recoveryRequestSchema)
    // Same answer whether or not the e-mail belongs to an account (no account discovery).
    const accepted = () => c.json({ accepted: true }, 202)
    if (input.website) return accepted()

    const ip = clientIp(c)
    if (ip) {
      const recent = await selectOne<{ n: number }>(
        pool,
        `SELECT COUNT(*) AS n FROM account_recovery_requests
          WHERE ip_address = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 1 HOUR`,
        [ip],
      )
      if (Number(recent?.n ?? 0) >= MAX_REQUESTS_PER_IP_PER_HOUR) {
        throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.')
      }
    }
    const email = input.kind === 'FORGOT_PASSWORD' ? input.email : null
    const contact = input.contact ?? null
    const message = input.message ?? null
    const userAgent = (c.req.header('User-Agent') ?? '').slice(0, 255) || null

    await withTransaction(pool, async (conn) => {
      // The same person asking again while the request is still open: merge, don't duplicate.
      const existing =
        input.kind === 'FORGOT_PASSWORD'
          ? await selectOne<{ id: string }>(
              conn,
              `SELECT id FROM account_recovery_requests
                WHERE status_code = 'OPEN' AND request_kind = 'FORGOT_PASSWORD'
                  AND submitted_email = ?
                ORDER BY id DESC LIMIT 1 FOR UPDATE`,
              [email],
            )
          : await selectOne<{ id: string }>(
              conn,
              `SELECT id FROM account_recovery_requests
                WHERE status_code = 'OPEN' AND request_kind = 'FORGOT_EMAIL'
                  AND submitted_name = ? AND contact_info = ?
                ORDER BY id DESC LIMIT 1 FOR UPDATE`,
              [input.name, contact],
            )
      if (existing) {
        await execute(
          conn,
          `UPDATE account_recovery_requests
              SET submit_count = submit_count + 1, last_submitted_at = UTC_TIMESTAMP(3),
                  submitted_name = ?, contact_info = COALESCE(?, contact_info),
                  message_text = COALESCE(?, message_text), ip_address = ?, user_agent = ?
            WHERE id = ?`,
          [input.name, contact, message, ip, userAgent, existing.id],
        )
        return
      }
      const user = email
        ? await selectOne<{ id: string }>(conn, 'SELECT id FROM users WHERE email = ?', [email])
        : null
      const result = await execute(
        conn,
        `INSERT INTO account_recovery_requests
           (request_kind, submitted_name, submitted_email, contact_info, message_text, user_id,
            ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.kind, input.name, email, contact, message, user?.id ?? null, ip, userAgent],
      )
      // Who asked stays in the request itself (Super Admin only), not in the activity log.
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'recovery_request',
        entityId: insertedId(result),
        action: 'CREATE',
        newValues: { kind: input.kind },
      })
    })
    return accepted()
  })

  routes.post('/auth/reset-password/check', async (c) => {
    const { token } = await parseBody(c, resetTokenSchema)
    const link = await usableLink(pool, token)
    const body: ResetLinkCheck = {
      email: link.email,
      display_name: link.display_name,
      issued_at: iso(link.issued_at) as string,
      expires_at: iso(link.expires_at) as string,
    }
    return c.json(body)
  })

  routes.post('/auth/reset-password', async (c) => {
    const input = await parseBody(c, resetPasswordSchema)
    const first = await usableLink(pool, input.token)
    if (input.new_password.toLowerCase().includes(first.email.split('@')[0] ?? '\u0000')) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
        { field: 'new_password', message: 'Password must not contain your e-mail name' },
      ])
    }
    const passwordHash = await hashPassword(input.new_password)
    await withTransaction(pool, async (conn) => {
      // Checked again under a row lock: the link can be used exactly once.
      const link = await usableLink(conn, input.token, true)
      const userId = String(link.user_id)
      await execute(conn, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId])
      await execute(
        conn,
        `UPDATE password_reset_links SET used_at = UTC_TIMESTAMP(3), active_user_id = NULL
          WHERE id = ?`,
        [link.id],
      )
      // Signed out everywhere; earlier failed logins no longer lock the account.
      await revokeUserSessions(conn, userId)
      await execute(
        conn,
        'DELETE FROM auth_login_attempts WHERE email_hash = ? AND succeeded = 0',
        [emailHash(link.email)],
      )
      // Open requests of this account are done (handled_by NULL = closed automatically).
      await execute(
        conn,
        `UPDATE account_recovery_requests
            SET status_code = 'RESOLVED', handled_at = UTC_TIMESTAMP(3), handled_by = NULL
          WHERE user_id = ? AND status_code = 'OPEN'`,
        [userId],
      )
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'user',
        entityId: userId,
        action: 'PASSWORD_RESET',
        newValues: { reset_link_id: String(link.id) },
      })
    })
    return c.body(null, 204)
  })

  return routes
}

/** Super Admin only: requests inbox and reset links. Mounted under /admin. */
export function recoveryAdminRoutes(pool: Pool, settings: SettingsService) {
  const routes = new Hono<AppEnv>()
  routes.use('*', async (c, next) => {
    requireSuperAdmin(c)
    await next()
  })

  routes.get('/recovery-summary', async (c) => {
    const row = await selectOne<{ open_requests: number; active_links: number }>(
      pool,
      `SELECT (SELECT COUNT(*) FROM account_recovery_requests
                WHERE status_code = 'OPEN') AS open_requests,
              (SELECT COUNT(*) FROM password_reset_links l WHERE ${ACTIVE_LINK}) AS active_links`,
    )
    const body: RecoverySummary = {
      open_requests: Number(row?.open_requests ?? 0),
      active_links: Number(row?.active_links ?? 0),
    }
    return c.json(body)
  })

  routes.get('/recovery-requests', async (c) => {
    const raw = c.req.query('status') ?? 'OPEN'
    const status = (RECOVERY_STATUSES as readonly string[]).includes(raw)
      ? (raw as RecoveryStatus)
      : undefined
    return c.json(await recoveryRequests(pool, { status }))
  })

  routes.patch('/recovery-requests/:requestId', async (c) => {
    const actor = requireSuperAdmin(c)
    const requestId = idParam(c, 'requestId')
    const input = await parseBody(c, recoveryRequestUpdateSchema)
    await withTransaction(pool, async (conn) => {
      const before = await selectOne<{
        status_code: RecoveryStatus
        user_id: string | null
        handled_by: string | null
        handled_at: Date | null
        resolution_note: string | null
      }>(
        conn,
        `SELECT status_code, user_id, handled_by, handled_at, resolution_note
           FROM account_recovery_requests WHERE id = ? FOR UPDATE`,
        [requestId],
      )
      if (!before) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      if (input.user_id) {
        const user = await selectOne(conn, 'SELECT id FROM users WHERE id = ?', [input.user_id])
        if (!user) {
          throw new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', [
            { field: 'user_id', message: 'Unknown account' },
          ])
        }
      }
      const status = input.status ?? before.status_code
      const statusChanged = status !== before.status_code
      const reopened = statusChanged && status === 'OPEN'
      await execute(
        conn,
        `UPDATE account_recovery_requests
            SET status_code = ?, user_id = ?, resolution_note = ?, handled_by = ?, handled_at = ?
          WHERE id = ?`,
        [
          status,
          input.user_id === undefined ? before.user_id : input.user_id,
          input.note === undefined ? before.resolution_note : input.note,
          reopened ? null : statusChanged ? actor.userId : before.handled_by,
          reopened ? null : statusChanged ? new Date() : before.handled_at,
          requestId,
        ],
      )
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'recovery_request',
        entityId: requestId,
        action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
        oldValues: {
          status: before.status_code,
          user_id: before.user_id === null ? null : String(before.user_id),
        },
        newValues: {
          status,
          ...(input.user_id !== undefined && { user_id: input.user_id }),
          ...(input.note !== undefined && { note_changed: true }),
        },
      })
    })
    const [request] = await recoveryRequests(pool, { id: requestId })
    return c.json(request)
  })

  routes.get('/reset-links', async (c) => c.json(await resetLinks(pool, ACTIVE_LINK)))

  routes.post('/users/:userId/reset-link', async (c) => {
    const actor = requireSuperAdmin(c)
    const userId = idParam(c, 'userId')
    const input = await parseBody(c, resetLinkIssueSchema)
    const hours = (await settings.get())['recovery.link_hours']
    const token = randomToken()
    const linkId = await withTransaction(pool, async (conn) => {
      const user = await selectOne<{
        id: string
        is_active: number
        auth_provider: string
        is_permanent: number
      }>(
        conn,
        `SELECT u.id, u.is_active, u.auth_provider,
                EXISTS (SELECT 1 FROM user_system_roles s
                         WHERE s.user_id = u.id AND s.role_code = 'SUPER_ADMIN'
                           AND s.is_permanent = 1) AS is_permanent
           FROM users u WHERE u.id = ? FOR UPDATE`,
        [userId],
      )
      if (!user) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      // The owner account is recovered on the server only (ADR 0011/0012).
      if (Number(user.is_permanent) === 1) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'The permanent Super Admin is recovered on the server only.',
          [{ field: 'user', message: 'PERMANENT_SUPER_ADMIN' }],
        )
      }
      if (Number(user.is_active) !== 1 || user.auth_provider !== 'LOCAL') {
        throw new AppError(409, 'CONFLICT', 'Activate the account before issuing a link.', [
          { field: 'user', message: 'ACCOUNT_INACTIVE' },
        ])
      }
      if (input.request_id) {
        const request = await selectOne<{ user_id: string | null }>(
          conn,
          'SELECT user_id FROM account_recovery_requests WHERE id = ? FOR UPDATE',
          [input.request_id],
        )
        if (!request) throw new AppError(404, 'NOT_FOUND', 'Not found.')
        if (request.user_id !== null && String(request.user_id) !== userId) {
          throw new AppError(409, 'CONFLICT', 'The request belongs to another account.', [
            { field: 'request_id', message: 'REQUEST_OTHER_ACCOUNT' },
          ])
        }
        if (request.user_id === null) {
          await execute(conn, 'UPDATE account_recovery_requests SET user_id = ? WHERE id = ?', [
            userId,
            input.request_id,
          ])
        }
      }
      await releaseExpiredLinks(conn, userId)
      const current = await selectOne<{ id: string }>(
        conn,
        'SELECT id FROM password_reset_links WHERE active_user_id = ?',
        [userId],
      )
      // One active link per account: a second one needs an explicit "revoke and replace".
      if (current && !input.replace) {
        throw new AppError(409, 'CONFLICT', 'This account already has an active reset link.', [
          { field: 'reset_link', message: 'RESET_LINK_ACTIVE' },
        ])
      }
      if (current) {
        await execute(
          conn,
          `UPDATE password_reset_links
              SET active_user_id = NULL, revoked_at = UTC_TIMESTAMP(3), revoked_by = ?
            WHERE id = ?`,
          [actor.userId, current.id],
        )
        await writeAudit(conn, c, {
          projectId: null,
          entityType: 'reset_link',
          entityId: String(current.id),
          action: 'REVOKE',
          newValues: { user_id: userId, replaced: true },
        })
      }
      let id: string
      try {
        const result = await execute(
          conn,
          `INSERT INTO password_reset_links
             (user_id, token_hash, active_user_id, request_id, issued_by, expires_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3) + INTERVAL ? HOUR)`,
          [userId, sha256Hex(token), userId, input.request_id ?? null, actor.userId, hours],
        )
        id = insertedId(result)
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new AppError(409, 'CONFLICT', 'This account already has an active reset link.', [
            { field: 'reset_link', message: 'RESET_LINK_ACTIVE' },
          ])
        }
        throw error
      }
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'reset_link',
        entityId: id,
        action: 'CREATE',
        newValues: {
          user_id: userId,
          valid_hours: hours,
          request_id: input.request_id ?? null,
          replaced: Boolean(current),
        },
      })
      return id
    })
    const [link] = await resetLinks(pool, 'l.id = ?', [linkId])
    // The raw token is returned once; only its hash is stored.
    return c.json({ link, token }, 201)
  })

  routes.delete('/users/:userId/reset-link', async (c) => {
    const actor = requireSuperAdmin(c)
    const userId = idParam(c, 'userId')
    await withTransaction(pool, async (conn) => {
      await releaseExpiredLinks(conn, userId)
      const current = await selectOne<{ id: string }>(
        conn,
        'SELECT id FROM password_reset_links WHERE active_user_id = ? FOR UPDATE',
        [userId],
      )
      if (!current) throw new AppError(404, 'NOT_FOUND', 'Not found.')
      await execute(
        conn,
        `UPDATE password_reset_links
            SET active_user_id = NULL, revoked_at = UTC_TIMESTAMP(3), revoked_by = ?
          WHERE id = ?`,
        [actor.userId, current.id],
      )
      await writeAudit(conn, c, {
        projectId: null,
        entityType: 'reset_link',
        entityId: String(current.id),
        action: 'REVOKE',
        newValues: { user_id: userId },
      })
    })
    return c.body(null, 204)
  })

  return routes
}
