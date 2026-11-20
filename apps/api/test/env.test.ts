import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/env.js'

describe('loadConfig', () => {
  it('applies safe local defaults', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 8787,
      logRequests: true,
    })
  })

  it('rejects an invalid port without echoing values', () => {
    expect(() => loadConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/)
  })

  it('refuses to bind the production API to a public interface', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', API_HOST: '0.0.0.0' })).toThrow(/loopback/)
    expect(loadConfig({ NODE_ENV: 'production', API_HOST: '127.0.0.1' }).host).toBe('127.0.0.1')
  })
})
