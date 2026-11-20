import { describe, expect, it } from 'vitest'
import { readWebEnv } from './env'

describe('readWebEnv', () => {
  it('defaults to safe demo mode, Indonesian and same-origin API path', () => {
    expect(readWebEnv({} as ImportMetaEnv)).toEqual({
      appName: 'TestBoard PASKER ID',
      apiBaseUrl: '/api/v1',
      demoMode: true,
      defaultLocale: 'id',
    })
  })

  it('only leaves demo mode when explicitly disabled and ignores unknown locales', () => {
    const env = readWebEnv({ VITE_DEMO_MODE: 'false', VITE_DEFAULT_LOCALE: 'fr' } as ImportMetaEnv)
    expect(env.demoMode).toBe(false)
    expect(env.defaultLocale).toBe('id')
  })
})
