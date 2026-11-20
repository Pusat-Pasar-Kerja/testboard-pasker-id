import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'

const DB_ENV = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_NAME: 'testboard',
  DB_USER: 'testboard_dev',
  DB_PASSWORD: 'local-only',
}

describe('loadConfig', () => {
  it('applies safe local defaults without a database', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 8787,
      logRequests: true,
      db: null,
    })
  })

  it('rejects an invalid port without echoing values', () => {
    expect(() => loadConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/)
  })

  it('refuses to bind the production API to a public interface', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', API_HOST: '0.0.0.0', ...DB_ENV })).toThrow(
      /loopback/,
    )
    expect(loadConfig({ NODE_ENV: 'production', API_HOST: '127.0.0.1', ...DB_ENV }).host).toBe(
      '127.0.0.1',
    )
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

  it('requires a database in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DB_HOST/)
  })
})
