import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, select, selectOne } from '../src/db/tx.js'
import { LocalStorage } from '../src/files/storage.js'
import { DEFAULT_RETENTION, runRetention } from '../src/maintenance/retention.js'
import { uiPng } from './support/fixtures.js'
import {
  addMember,
  Client,
  createHarness,
  createProject,
  createUser,
  ORIGIN,
} from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
const P = () => `/projects/${project.code}`

beforeAll(async () => {
  project = await createProject(h.pool)
  const user = await createUser(h.pool, { name: 'Hardening lead' })
  await addMember(h.pool, project.id, user.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(user.email)
})

describe('client address behind the proxy', () => {
  it('uses the hop Apache appended, never the spoofable first entry', async () => {
    const email = `nobody-${Date.now()}@demo.invalid`
    const res = await h.app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.7, 198.51.100.23',
      },
      body: JSON.stringify({ email, password: 'wrong-password-123' }),
    })
    expect(res.status).toBe(401)
    const rows = await select<{ ip_address: string }>(
      h.pool,
      "SELECT ip_address FROM auth_login_attempts WHERE ip_address IN ('203.0.113.7', '198.51.100.23')",
    )
    expect(rows.map((r) => r.ip_address)).toEqual(['198.51.100.23'])
  })
})

describe('retention clean-up (ADR 0010)', () => {
  it('deletes only never-used uploads after 90 days, then frees their bytes', async () => {
    const upload = await lead.upload(`${P()}/files`, [
      { name: 'nganggur.png', data: await uiPng() },
      { name: 'dipakai.png', data: await uiPng() },
    ])
    expect(upload.status).toBe(202)
    await h.files.idle()
    const [unused, used] = (upload.json.files as { id: string }[]).map((f) => f.id)
    const bug = await lead.post(`${P()}/defects`, {
      title: 'Bug dengan bukti',
      evidence: [{ file_id: used }],
    })
    expect(bug.status).toBe(201)
    await execute(
      h.pool,
      'UPDATE file_objects SET uploaded_at = UTC_TIMESTAMP(3) - INTERVAL 100 DAY WHERE id IN (?, ?)',
      [unused, used],
    )

    const dry = await runRetention(h.pool, h.config.storageDir, DEFAULT_RETENTION, {
      dryRun: true,
    })
    expect(dry.dry_run).toBe(true)
    expect(dry.unused_files_deleted).toBeGreaterThanOrEqual(1)
    const stillThere = await selectOne<{ deleted_at: Date | null }>(
      h.pool,
      'SELECT deleted_at FROM file_objects WHERE id = ?',
      [unused],
    )
    expect(stillThere?.deleted_at).toBeNull()

    await runRetention(h.pool, h.config.storageDir)
    const files = await select<{
      id: string
      deleted_at: Date | null
      object_key: string
      storage_backend: string
    }>(
      h.pool,
      'SELECT id, deleted_at, object_key, storage_backend FROM file_objects WHERE id IN (?, ?) ORDER BY id',
      [unused, used],
    )
    const byId = new Map(files.map((f) => [String(f.id), f]))
    expect(byId.get(unused as string)?.deleted_at).not.toBeNull()
    expect(byId.get(used as string)?.deleted_at).toBeNull()
    const audit = await selectOne<{ actor_id: string | null; new_values_json: string }>(
      h.pool,
      "SELECT actor_id, new_values_json FROM audit_logs WHERE entity_type = 'file' AND entity_id = ? AND action_code = 'DELETE'",
      [unused],
    )
    expect(audit?.actor_id).toBeNull()
    expect(String(audit?.new_values_json)).toContain('RETENTION_UNUSED')

    // Bytes stay for the 7-day undo window, then go; the record (and its audit trail) stays.
    const storage = new LocalStorage(h.config.storageDir)
    const path = storage.pathOf(byId.get(unused as string)?.object_key as string)
    expect(existsSync(path)).toBe(true)
    await execute(
      h.pool,
      'UPDATE file_objects SET deleted_at = UTC_TIMESTAMP(3) - INTERVAL 8 DAY WHERE id = ?',
      [unused],
    )
    const purge = await runRetention(h.pool, h.config.storageDir)
    expect(purge.files_purged).toBeGreaterThanOrEqual(1)
    expect(existsSync(path)).toBe(false)
    const purged = await selectOne<{ storage_backend: string }>(
      h.pool,
      'SELECT storage_backend FROM file_objects WHERE id = ?',
      [unused],
    )
    expect(purged?.storage_backend).toBe('PURGED')
    expect(existsSync(storage.pathOf(byId.get(used as string)?.object_key as string))).toBe(true)
  })

  it('removes stale sessions and quarantine leftovers', async () => {
    const user = await createUser(h.pool, { name: 'Old session' })
    const id = `${'a'.repeat(32)}${Date.now().toString(16).padStart(32, '0')}`.slice(0, 64)
    await execute(
      h.pool,
      `INSERT INTO user_sessions (id, user_id, csrf_token_hash, expires_at, last_seen_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(3) - INTERVAL 30 DAY, UTC_TIMESTAMP(3) - INTERVAL 31 DAY)`,
      [id, user.id, 'b'.repeat(64)],
    )
    const tmp = join(h.config.storageDir, 'tmp')
    mkdirSync(tmp, { recursive: true })
    const stale = join(tmp, 'stale.part')
    const fresh = join(tmp, 'fresh.part')
    writeFileSync(stale, 'x')
    writeFileSync(fresh, 'y')
    const old = new Date(Date.now() - 2 * 86_400_000)
    utimesSync(stale, old, old)

    const report = await runRetention(h.pool, h.config.storageDir)
    expect(report.sessions_removed).toBeGreaterThanOrEqual(1)
    expect(await selectOne(h.pool, 'SELECT id FROM user_sessions WHERE id = ?', [id])).toBeNull()
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    // The lead's own live session is untouched.
    expect((await lead.get('/auth/me')).status).toBe(200)
  })
})
