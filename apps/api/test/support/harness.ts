import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MemberRole } from '@testboard/shared'
import type { Pool } from 'mysql2/promise'
import { createApp } from '../../src/app.js'
import { hashPassword } from '../../src/auth/passwords.js'
import { loadConfig, type AppConfig } from '../../src/config/env.js'
import { createPool } from '../../src/db/pool.js'
import { execute, insertedId } from '../../src/db/tx.js'
import { createFileService } from '../../src/files/pipeline.js'
import type { Scanner } from '../../src/files/scanner.js'
import { TEST_DATABASE } from './global-setup.js'

/** Shared integration-test harness: real app + real (local, throwaway) database. */
const envFile = new URL('../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

export const ORIGIN = 'http://127.0.0.1:5173'

/** Test evidence lives on the repo drive (gitignored), cleared by global-setup. */
export const TEST_STORAGE = fileURLToPath(
  new URL('../../../../.private-storage/test/', import.meta.url),
)

export function testConfig(): AppConfig {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DATABASE,
    ALLOWED_ORIGINS: ORIGIN,
    LOG_REQUESTS: 'false',
  })
  if (!config.db || !['127.0.0.1', 'localhost'].includes(config.db.host)) {
    throw new Error('Integration tests need the local database settings in apps/api/.env')
  }
  return config
}

/**
 * Real app + pool. Evidence goes to a throwaway temp folder per harness; `scanner`
 * replaces the antivirus step (e.g. to simulate a scan failure).
 */
export function createHarness(options: { scanner?: Scanner } = {}) {
  mkdirSync(TEST_STORAGE, { recursive: true })
  const config = { ...testConfig(), storageDir: mkdtempSync(join(TEST_STORAGE, 'run-')) }
  const pool: Pool = createPool(config.db!)
  const files = createFileService(pool, config, { scanner: options.scanner })
  const app = createApp({ config, pool, files, logError: () => undefined })
  return { config, pool, app, files }
}

export type Harness = ReturnType<typeof createHarness>

let counter = 0
/** Unique suffix so tests never collide (codes and e-mails are unique in the schema). */
export function unique(prefix: string): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`.toUpperCase()
}

export const PASSWORD = 'Correct-Horse-Battery-9'

export async function createUser(
  pool: Pool,
  options: { name?: string; superAdmin?: boolean; active?: boolean; password?: string } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = `${unique('u').toLowerCase()}@test.invalid`
  const password = options.password ?? PASSWORD
  const result = await execute(
    pool,
    `INSERT INTO users (display_name, email, password_hash, auth_provider, is_active)
     VALUES (?, ?, ?, 'LOCAL', ?)`,
    [
      options.name ?? 'Test User',
      email,
      await hashPassword(password),
      options.active === false ? 0 : 1,
    ],
  )
  const id = insertedId(result)
  if (options.superAdmin) {
    await execute(
      pool,
      "INSERT INTO user_system_roles (user_id, role_code) VALUES (?, 'SUPER_ADMIN')",
      [id],
    )
  }
  return { id, email, password }
}

export async function addMember(pool: Pool, projectId: string, userId: string, role: MemberRole) {
  await execute(
    pool,
    'INSERT INTO project_members (project_id, user_id, role_code) VALUES (?, ?, ?)',
    [projectId, userId, role],
  )
}

/** Minimal browser-like client: keeps cookies and sends the CSRF header + Origin. */
export class Client {
  readonly cookies = new Map<string, string>()

  constructor(private readonly harness: Harness) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const headers: Record<string, string> = { Origin: ORIGIN, ...extraHeaders }
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const csrf = this.cookies.get('tb_csrf')
    if (csrf && !('X-CSRF-Token' in extraHeaders)) headers['X-CSRF-Token'] = csrf
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await this.harness.app.request(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const [name, ...rest] = (pair ?? '').split('=')
      const value = rest.join('=')
      if (!name) continue
      if (value === '' || /max-age=0/i.test(cookie)) this.cookies.delete(name.trim())
      else this.cookies.set(name.trim(), value)
    }
    const text = await res.text()
    const json = text ? (JSON.parse(text) as unknown) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
    return { status: res.status, json: json as any, headers: res.headers }
  }

  get(path: string) {
    return this.request('GET', path)
  }

  /** Multipart upload of evidence files (field name "files"). */
  async upload(path: string, files: { name: string; data: Buffer | string }[]) {
    const form = new FormData()
    for (const file of files) form.append('files', new Blob([file.data]), file.name)
    const headers: Record<string, string> = { Origin: ORIGIN }
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const csrf = this.cookies.get('tb_csrf')
    if (csrf) headers['X-CSRF-Token'] = csrf
    const res = await this.harness.app.request(`/api/v1${path}`, {
      method: 'POST',
      headers,
      body: form,
    })
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
    return { status: res.status, json: (text ? JSON.parse(text) : null) as any }
  }

  /** Raw GET for file streams: status, headers and bytes. */
  async raw(path: string, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extraHeaders }
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const res = await this.harness.app.request(`/api/v1${path}`, { headers })
    return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) }
  }
  post(path: string, body: unknown = {}) {
    return this.request('POST', path, body)
  }
  patch(path: string, body: unknown) {
    return this.request('PATCH', path, body)
  }
  delete(path: string) {
    return this.request('DELETE', path)
  }

  async login(email: string, password = PASSWORD) {
    const res = await this.post('/auth/login', { email, password })
    if (res.status !== 200) throw new Error(`login failed: ${res.status}`)
    return res
  }
}

/** Create a project directly (as if a Super Admin did it) and return its id/code. */
export async function createProject(pool: Pool, code = unique('P')) {
  const result = await execute(pool, 'INSERT INTO projects (project_code, name) VALUES (?, ?)', [
    code,
    `Project ${code}`,
  ])
  const id = insertedId(result)
  await execute(
    pool,
    "INSERT INTO modules (project_id, module_code, name) VALUES (?, 'AUTH', 'Auth')",
    [id],
  )
  return { id, code }
}
