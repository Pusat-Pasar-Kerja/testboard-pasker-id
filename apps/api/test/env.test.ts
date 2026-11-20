import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))

const DB_ENV = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_NAME: 'testboard',
  DB_USER: 'testboard_dev',
  DB_PASSWORD: 'local-only',
}

const PROD = {
  NODE_ENV: 'production',
  ALLOWED_ORIGINS: 'https://testboard.example',
  STORAGE_DIR: '/var/lib/testboard/storage',
  ...DB_ENV,
}

describe('loadConfig', () => {
  it('applies safe local defaults without a database', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 8787,
      logRequests: true,
      db: null,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      cookieSecure: false,
      sessionHours: 12,
      sessionIdleMinutes: 120,
      storageDir: expect.stringMatching(/\.private-storage$/),
      scan: { engine: 'basic', clamdHost: '127.0.0.1', clamdPort: 3310 },
    })
  })

  it('rejects an invalid port without echoing values', () => {
    expect(() => loadConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/)
  })

  it('refuses to bind the production API to a public interface', () => {
    expect(() => loadConfig({ ...PROD, API_HOST: '0.0.0.0' })).toThrow(/loopback/)
    expect(loadConfig({ ...PROD, API_HOST: '127.0.0.1' }).host).toBe('127.0.0.1')
  })

  it('parses database settings and requires all of them once DB_HOST is set', () => {
    expect(loadConfig(DB_ENV).db).toEqual({
      host: '127.0.0.1',
      port: 3307,
      database: 'testboard',
      user: 'testboard_dev',
      password: 'local-only',
      connectionLimit: 10,
    })
    const error = (() => {
      try {
        loadConfig({ DB_HOST: '127.0.0.1', DB_USER: 'x', DB_PASSWORD: 'secret-value' })
      } catch (e) {
        return e as Error
      }
    })()
    expect(error?.message).toMatch(/DB_NAME/)
    expect(error?.message).not.toContain('secret-value')
  })

  it('requires a database and explicit allowed origins in production, with secure cookies', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://x.example' }),
    ).toThrow(/DB_HOST/)
    expect(() => loadConfig({ NODE_ENV: 'production', ...DB_ENV })).toThrow(/ALLOWED_ORIGINS/)
    const prod = loadConfig({ ...PROD, COOKIE_SECURE: 'false' })
    expect(prod.cookieSecure).toBe(true)
    expect(prod.allowedOrigins).toEqual(['https://testboard.example'])
  })

  it('keeps production evidence outside the application (web root) directory', () => {
    const { STORAGE_DIR: _omit, ...withoutStorage } = PROD
    expect(() => loadConfig(withoutStorage)).toThrow(/STORAGE_DIR/)
    expect(() => loadConfig({ ...PROD, STORAGE_DIR: 'storage' })).toThrow(/absolute/)
    expect(() => loadConfig({ ...PROD, STORAGE_DIR: join(REPO, 'evidence') })).toThrow(
      /application directory/,
    )
    expect(loadConfig(PROD).storageDir).toMatch(/testboard[\\/]storage$/)
  })

  it('uses the built-in checks by default and ClamAV only when asked', () => {
    expect(loadConfig({}).scan.engine).toBe('basic')
    expect(loadConfig({ SCAN_ENGINE: 'clamav', CLAMD_PORT: '3311' }).scan).toEqual({
      engine: 'clamav',
      clamdHost: '127.0.0.1',
      clamdPort: 3311,
    })
    expect(() => loadConfig({ SCAN_ENGINE: 'virustotal' })).toThrow(/SCAN_ENGINE/)
  })
})
