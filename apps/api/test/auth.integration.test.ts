import type { RowDataPacket } from 'mysql2/promise'
import { afterAll, describe, expect, it } from 'vitest'
import { Client, createHarness, createUser, PASSWORD } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

describe('login & session (TB-AUTH-001..004)', () => {
  it('TB-AUTH-001: active user signs in and gets an HttpOnly session cookie', async () => {
    const user = await createUser(h.pool, { name: 'Ani Login' })
    const client = new Client(h)
    const res = await client.post('/auth/login', {
      email: user.email.toUpperCase(),
      password: PASSWORD,
    })

    expect(res.status).toBe(200)
    expect(res.json.user).toMatchObject({ email: user.email, is_super_admin: false })
    const setCookies = res.headers.getSetCookie().join('\n')
    expect(setCookies).toMatch(/tb_session=[^;]+;.*HttpOnly/i)
    expect(setCookies).toMatch(/SameSite=Lax/i)

    const me = await client.get('/auth/me')
    expect(me.status).toBe(200)
    expect(me.json.display_name).toBe('Ani Login')
  })

  it('stores only a hash of the session token, never the token itself', async () => {
    const user = await createUser(h.pool)
    const client = new Client(h)
    await client.login(user.email)
    const token = client.cookies.get('tb_session') ?? ''
    const [rows] = await h.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM user_sessions WHERE id = ? OR csrf_token_hash = ?',
      [token, token],
    )
    expect(Number(rows[0]?.n)).toBe(0)
  })

  it('TB-AUTH-002: wrong password gives a generic error, no session, then a lockout', async () => {
    const user = await createUser(h.pool)
    const client = new Client(h)
    const wrong = await client.post('/auth/login', {
      email: user.email,
      password: 'nope-nope-nope',
    })
    expect(wrong.status).toBe(401)
    expect(wrong.json.error.message).toBe('Invalid email or password.')
    expect(client.cookies.has('tb_session')).toBe(false)

    const unknown = await client.post('/auth/login', {
      email: 'nobody@test.invalid',
      password: 'nope-nope-nope',
    })
    expect(unknown.status).toBe(401)
    expect(unknown.json.error.message).toBe(wrong.json.error.message)

    for (let i = 0; i < 4; i += 1) {
      await client.post('/auth/login', { email: user.email, password: 'still-wrong-1' })
    }
    const locked = await client.post('/auth/login', { email: user.email, password: PASSWORD })
    expect(locked.status).toBe(429)
  })

  it('TB-AUTH-003: a disabled user cannot sign in', async () => {
    const user = await createUser(h.pool, { active: false })
    const res = await new Client(h).post('/auth/login', { email: user.email, password: PASSWORD })
    expect(res.status).toBe(401)
  })

  it('TB-AUTH-004: after logout the old session cookie no longer works', async () => {
    const user = await createUser(h.pool)
    const client = new Client(h)
    await client.login(user.email)
    const stolen = new Client(h)
    for (const [k, v] of client.cookies) stolen.cookies.set(k, v)

    expect((await client.post('/auth/logout')).status).toBe(204)
    expect(client.cookies.has('tb_session')).toBe(false)
    expect((await stolen.get('/auth/me')).status).toBe(401)
  })

  it('records LOGIN in the audit log without any secret', async () => {
    const user = await createUser(h.pool)
    await new Client(h).login(user.email)
    const [rows] = await h.pool.query<RowDataPacket[]>(
      "SELECT action_code, new_values_json FROM audit_logs WHERE entity_type = 'user' AND entity_id = ?",
      [user.id],
    )
    expect(rows.map((r) => r.action_code)).toContain('LOGIN')
    expect(JSON.stringify(rows)).not.toContain(PASSWORD)
  })
})

describe('CSRF protection', () => {
  it('rejects a signed-in mutation without the CSRF header', async () => {
    const user = await createUser(h.pool)
    const client = new Client(h)
    await client.login(user.email)
    const res = await client.request(
      'PATCH',
      '/profile',
      { display_name: 'X' },
      { 'X-CSRF-Token': '' },
    )
    expect(res.status).toBe(403)
  })

  it('rejects a CSRF token taken from another session', async () => {
    const a = await createUser(h.pool)
    const b = await createUser(h.pool)
    const clientA = new Client(h)
    const clientB = new Client(h)
    await clientA.login(a.email)
    await clientB.login(b.email)
    const res = await clientA.request(
      'PATCH',
      '/profile',
      { display_name: 'X' },
      { 'X-CSRF-Token': clientB.cookies.get('tb_csrf') ?? '' },
    )
    expect(res.status).toBe(403)
  })

  it('rejects requests from a foreign browser origin, including login', async () => {
    const user = await createUser(h.pool)
    const res = await new Client(h).request(
      'POST',
      '/auth/login',
      { email: user.email, password: PASSWORD },
      { Origin: 'https://evil.example' },
    )
    expect(res.status).toBe(403)
  })
})

describe('profile', () => {
  it('updates display name and locale', async () => {
    const user = await createUser(h.pool)
    const client = new Client(h)
    await client.login(user.email)
    const res = await client.patch('/profile', {
      display_name: 'Budi Baru',
      preferred_locale: 'en',
    })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ display_name: 'Budi Baru', preferred_locale: 'en' })
  })

  it('changing the password signs out other devices and invalidates the old password', async () => {
    const user = await createUser(h.pool)
    const laptop = new Client(h)
    const phone = new Client(h)
    await laptop.login(user.email)
    await phone.login(user.email)

    const weak = await laptop.post('/profile/change-password', {
      current_password: PASSWORD,
      new_password: 'short',
    })
    expect(weak.status).toBe(422)

    const ok = await laptop.post('/profile/change-password', {
      current_password: PASSWORD,
      new_password: 'A-much-better-passphrase-42',
    })
    expect(ok.status).toBe(204)
    expect((await laptop.get('/auth/me')).status).toBe(200)
    expect((await phone.get('/auth/me')).status).toBe(401)
    const oldLogin = await new Client(h).post('/auth/login', {
      email: user.email,
      password: PASSWORD,
    })
    expect(oldLogin.status).toBe(401)
  })
})
