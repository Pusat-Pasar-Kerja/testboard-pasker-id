import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setPermanentSuperAdmin } from '../src/auth/owner.js'
import { execute, select, selectOne } from '../src/db/tx.js'
import { runRetention } from '../src/maintenance/retention.js'
import { MAX_REQUESTS_PER_IP_PER_HOUR } from '../src/routes/recovery.js'
import { Client, createHarness, createUser, PASSWORD, unique } from './support/harness.js'

const h = createHarness()
afterAll(async () => {
  await execute(h.pool, "DELETE FROM system_settings WHERE setting_key = 'recovery.link_hours'")
  await h.pool.end()
})

let admin: Client
let adminId: string
let other: Client
let visitor: Client
let ipCounter = 0
/** Each test sends from its own documentation-range address (rate limit is per address). */
const nextIp = () => `198.51.100.${(ipCounter += 1)}`

beforeAll(async () => {
  const sa = await createUser(h.pool, { superAdmin: true, name: 'Admin Pemulihan' })
  adminId = sa.id
  admin = new Client(h)
  await admin.login(sa.email)
  const plain = await createUser(h.pool, { name: 'Bukan Admin' })
  other = new Client(h)
  await other.login(plain.email)
  visitor = new Client(h)
})

function ask(body: Record<string, unknown>, ip = nextIp()) {
  return visitor.request('POST', '/auth/recovery-requests', body, { 'X-Forwarded-For': ip })
}

async function requestsFor(email: string) {
  return select<{ id: string; user_id: string | null; submit_count: number; status_code: string }>(
    h.pool,
    'SELECT id, user_id, submit_count, status_code FROM account_recovery_requests WHERE submitted_email = ?',
    [email],
  )
}

describe('forgot e-mail / password requests', () => {
  it('answers the same for known and unknown e-mails and shows them to Super Admins only', async () => {
    const known = await createUser(h.pool, { name: 'Penguji Lupa' })
    const unknownEmail = `${unique('nobody').toLowerCase()}@test.invalid`
    const a = await ask({ kind: 'FORGOT_PASSWORD', email: known.email, name: 'Penguji Lupa' })
    const b = await ask({ kind: 'FORGOT_PASSWORD', email: unknownEmail, name: 'Siapa' })
    expect([a.status, b.status]).toEqual([202, 202])
    expect(a.json).toEqual(b.json)

    expect(String((await requestsFor(known.email))[0]?.user_id)).toBe(known.id)
    expect((await requestsFor(unknownEmail))[0]?.user_id).toBeNull()

    const list = await admin.get('/admin/recovery-requests')
    expect(list.status).toBe(200)
    expect(list.json.find((r: { email: string }) => r.email === known.email)).toMatchObject({
      kind: 'FORGOT_PASSWORD',
      status: 'OPEN',
      name: 'Penguji Lupa',
      user: { id: known.id, is_active: true },
      active_link: null,
    })
    expect((await other.get('/admin/recovery-requests')).status).toBe(403)
    expect((await visitor.get('/admin/recovery-requests')).status).toBe(401)
    expect((await admin.get('/admin/recovery-summary')).json.open_requests).toBeGreaterThan(0)
  })

  it('merges a repeated request, ignores bots and limits requests per address', async () => {
    const email = `${unique('again').toLowerCase()}@test.invalid`
    await ask({ kind: 'FORGOT_PASSWORD', email, name: 'Ulang' })
    await ask({ kind: 'FORGOT_PASSWORD', email, name: 'Ulang', message: 'Mohon dibantu' })
    const rows = await requestsFor(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.submit_count).toBe(2)

    const botEmail = `${unique('bot').toLowerCase()}@test.invalid`
    const bot = await ask({ kind: 'FORGOT_PASSWORD', email: botEmail, name: 'x', website: 'spam' })
    expect(bot.status).toBe(202)
    expect(await requestsFor(botEmail)).toHaveLength(0)

    const ip = nextIp()
    for (let i = 0; i < MAX_REQUESTS_PER_IP_PER_HOUR; i += 1) {
      const res = await ask({ kind: 'FORGOT_EMAIL', name: `Orang ${i}`, contact: 'WA 0812' }, ip)
      expect(res.status).toBe(202)
    }
    const limited = await ask({ kind: 'FORGOT_EMAIL', name: 'Orang lagi', contact: 'WA 0812' }, ip)
    expect(limited.status).toBe(429)
  })

  it('needs a contact for a forgotten e-mail and lets a Super Admin link, close and reopen it', async () => {
    const missing = await ask({ kind: 'FORGOT_EMAIL', name: 'Tanpa Kontak' })
    expect(missing.status).toBe(422)
    expect(missing.json.error.details[0].field).toBe('contact')

    const name = `Lupa Email ${unique('n')}`
    await ask({ kind: 'FORGOT_EMAIL', name, contact: 'WA 0812-0000-0000' })
    const request = (await admin.get('/admin/recovery-requests')).json.find(
      (r: { name: string }) => r.name === name,
    )
    expect(request).toMatchObject({ kind: 'FORGOT_EMAIL', email: null, user: null })

    const owner = await createUser(h.pool, { name })
    const unknown = await admin.patch(`/admin/recovery-requests/${request.id}`, {
      user_id: '999999999',
    })
    expect(unknown.status).toBe(422)
    const linked = await admin.patch(`/admin/recovery-requests/${request.id}`, {
      user_id: owner.id,
      status: 'RESOLVED',
      note: 'Email diberi tahu lewat WhatsApp',
    })
    expect(linked.json).toMatchObject({
      status: 'RESOLVED',
      user: { id: owner.id },
      handled_by: { id: adminId },
      note: 'Email diberi tahu lewat WhatsApp',
    })
    const reopened = await admin.patch(`/admin/recovery-requests/${request.id}`, { status: 'OPEN' })
    expect(reopened.json).toMatchObject({ status: 'OPEN', handled_by: null, handled_at: null })
  })
})

describe('reset links', () => {
  it('issues one active link per account; a second needs an explicit replace', async () => {
    const user = await createUser(h.pool, { name: 'Satu Tautan' })
    await ask({ kind: 'FORGOT_PASSWORD', email: user.email, name: 'Satu Tautan' })
    const [request] = await requestsFor(user.email)

    const first = await admin.post(`/admin/users/${user.id}/reset-link`, {
      request_id: String(request?.id),
    })
    expect(first.status).toBe(201)
    expect(first.json.token).toMatch(/^[\w-]{40,}$/)
    expect(first.json.link).toMatchObject({
      user: { id: user.id, email: user.email },
      issued_by: { id: adminId },
      request_id: String(request?.id),
    })
    const hours =
      (Date.parse(first.json.link.expires_at) - Date.parse(first.json.link.issued_at)) / 3_600_000
    expect(hours).toBeCloseTo(24, 1)
    // Only the hash is stored.
    const stored = await selectOne<{ token_hash: string }>(
      h.pool,
      'SELECT token_hash FROM password_reset_links WHERE id = ?',
      [first.json.link.id],
    )
    expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.token_hash).not.toContain(first.json.token)

    const again = await admin.post(`/admin/users/${user.id}/reset-link`, {})
    expect(again.status).toBe(409)
    expect(again.json.error.details[0].message).toBe('RESET_LINK_ACTIVE')

    const listed = (await admin.get('/admin/users')).json.find(
      (u: { id: string }) => u.id === user.id,
    )
    expect(listed.reset_link).toEqual({
      issued_at: first.json.link.issued_at,
      expires_at: first.json.link.expires_at,
    })
    const inRequests = (await admin.get('/admin/recovery-requests')).json.find(
      (r: { id: string }) => r.id === String(request?.id),
    )
    expect(inRequests.active_link.id).toBe(first.json.link.id)

    const replaced = await admin.post(`/admin/users/${user.id}/reset-link`, { replace: true })
    expect(replaced.status).toBe(201)
    const old = await visitor.post('/auth/reset-password/check', { token: first.json.token })
    expect(old.status).toBe(404)
    expect(old.json.error.details[0].message).toBe('REVOKED')
    const check = await visitor.post('/auth/reset-password/check', { token: replaced.json.token })
    expect(check.status).toBe(200)
    expect(check.json).toMatchObject({ email: user.email, display_name: 'Satu Tautan' })

    const links = await select(
      h.pool,
      'SELECT id FROM password_reset_links WHERE active_user_id = ?',
      [user.id],
    )
    expect(links).toHaveLength(1)
    expect((await other.post(`/admin/users/${user.id}/reset-link`, {})).status).toBe(403)
  })

  it('sets a new password once, signs out everywhere and closes the request', async () => {
    const user = await createUser(h.pool, { name: 'Ganti Sandi' })
    const session = new Client(h)
    await session.login(user.email)
    await ask({ kind: 'FORGOT_PASSWORD', email: user.email, name: 'Ganti Sandi' })
    const issued = await admin.post(`/admin/users/${user.id}/reset-link`, {})
    const token = issued.json.token as string

    const tooShort = await visitor.post('/auth/reset-password', { token, new_password: 'short' })
    expect(tooShort.status).toBe(422)
    const local = user.email.split('@')[0] as string
    const withName = await visitor.post('/auth/reset-password', {
      token,
      new_password: `${local}-Panjang-123`,
    })
    expect(withName.status).toBe(422)

    const done = await visitor.post('/auth/reset-password', {
      token,
      new_password: 'Sandi-Baru-Aman-2026',
    })
    expect(done.status).toBe(204)
    expect((await session.get('/auth/me')).status).toBe(401)
    const fresh = new Client(h)
    expect(
      (await fresh.post('/auth/login', { email: user.email, password: PASSWORD })).status,
    ).toBe(401)
    await fresh.login(user.email, 'Sandi-Baru-Aman-2026')

    const reused = await visitor.post('/auth/reset-password', {
      token,
      new_password: 'Sandi-Lain-Lagi-2026',
    })
    expect(reused.status).toBe(404)
    expect(reused.json.error.details[0].message).toBe('USED')
    expect((await requestsFor(user.email))[0]?.status_code).toBe('RESOLVED')
    const audit = await selectOne<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? AND action_code = 'PASSWORD_RESET'",
      [user.id],
    )
    expect(Number(audit?.n)).toBe(1)
    // The account is free for a new link again.
    expect((await admin.post(`/admin/users/${user.id}/reset-link`, {})).status).toBe(201)
  })

  it('follows the validity setting, expires, and can be revoked', async () => {
    expect(
      (await admin.request('PUT', '/admin/settings', { 'recovery.link_hours': 2 })).status,
    ).toBe(200)
    const user = await createUser(h.pool, { name: 'Tautan Pendek' })
    const issued = await admin.post(`/admin/users/${user.id}/reset-link`, {})
    const hours =
      (Date.parse(issued.json.link.expires_at) - Date.parse(issued.json.link.issued_at)) / 3_600_000
    expect(hours).toBeCloseTo(2, 1)

    await execute(
      h.pool,
      'UPDATE password_reset_links SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE WHERE id = ?',
      [issued.json.link.id],
    )
    const expired = await visitor.post('/auth/reset-password/check', { token: issued.json.token })
    expect(expired.json.error.details[0].message).toBe('EXPIRED')
    // An expired link does not block a new one.
    const next = await admin.post(`/admin/users/${user.id}/reset-link`, {})
    expect(next.status).toBe(201)
    expect((await admin.get('/admin/reset-links')).json.map((l: { id: string }) => l.id)).toContain(
      next.json.link.id,
    )

    expect((await admin.delete(`/admin/users/${user.id}/reset-link`)).status).toBe(204)
    expect((await admin.delete(`/admin/users/${user.id}/reset-link`)).status).toBe(404)
    const revoked = await visitor.post('/auth/reset-password/check', { token: next.json.token })
    expect(revoked.json.error.details[0].message).toBe('REVOKED')
    const garbage = await visitor.post('/auth/reset-password/check', { token: 'x'.repeat(43) })
    expect(garbage.json.error.details[0].message).toBe('INVALID')
  })

  it('refuses the permanent owner and inactive accounts', async () => {
    const owner = await createUser(h.pool, { superAdmin: true, name: 'Pemilik' })
    await setPermanentSuperAdmin(h.pool, owner.email, true)
    try {
      const refused = await admin.post(`/admin/users/${owner.id}/reset-link`, {})
      expect(refused.status).toBe(403)
      expect(refused.json.error.details[0].message).toBe('PERMANENT_SUPER_ADMIN')
    } finally {
      await setPermanentSuperAdmin(h.pool, owner.email, false)
    }
    const inactive = await createUser(h.pool, { active: false })
    const blocked = await admin.post(`/admin/users/${inactive.id}/reset-link`, {})
    expect(blocked.status).toBe(409)
    expect(blocked.json.error.details[0].message).toBe('ACCOUNT_INACTIVE')
  })

  it('removes closed requests and long-expired links in the daily clean-up', async () => {
    const user = await createUser(h.pool)
    const email = `${unique('old').toLowerCase()}@test.invalid`
    await execute(
      h.pool,
      `INSERT INTO account_recovery_requests (request_kind, status_code, submitted_name, submitted_email, handled_at)
       VALUES ('FORGOT_PASSWORD', 'RESOLVED', 'Lama', ?, UTC_TIMESTAMP(3) - INTERVAL 200 DAY)`,
      [email],
    )
    await execute(
      h.pool,
      `INSERT INTO password_reset_links (user_id, token_hash, expires_at)
       VALUES (?, ?, UTC_TIMESTAMP(3) - INTERVAL 40 DAY)`,
      [user.id, 'a'.repeat(64)],
    )
    const report = await runRetention(h.pool, h.config.storageDir)
    expect(report.recovery_requests_removed).toBeGreaterThanOrEqual(1)
    expect(report.reset_links_removed).toBeGreaterThanOrEqual(1)
    expect(await requestsFor(email)).toHaveLength(0)
  })
})
