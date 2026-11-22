import {
  defaultSiteSettings,
  settingValue,
  SITE_SETTING_KEYS,
  type SiteSettingKey,
  type SiteSettings,
} from '@testboard/shared'
import type { Pool } from 'mysql2/promise'
import type { AppConfig } from '../config/env.js'
import { select } from '../db/tx.js'

/**
 * Website settings (ADR 0011): defaults (some from the server's env file) overridden by
 * what a Super Admin saved in `system_settings`. Cached briefly so every request does not
 * hit the database; a save invalidates the cache, so changes apply within seconds.
 */
export interface SettingsService {
  get(): Promise<SiteSettings>
  invalidate(): void
  /** The server config with the session timing the Super Admin chose. */
  sessionConfig(config: AppConfig): Promise<AppConfig>
}

const CACHE_MS = 15_000

export function createSettingsService(pool: Pool | null, config: AppConfig): SettingsService {
  let cached: { at: number; value: SiteSettings } | null = null

  const defaults = (): SiteSettings => ({
    ...defaultSiteSettings(),
    'auth.session_hours': config.sessionHours,
    'auth.idle_minutes': config.sessionIdleMinutes,
    'auth.remember_days': config.rememberDays,
    'retention.unused_file_days': config.retention.unusedFileDays,
    'retention.import_days': config.retention.importDays,
  })

  async function load(): Promise<SiteSettings> {
    const values = defaults()
    if (!pool) return values
    const rows = await select<{ setting_key: string; value_json: unknown }>(
      pool,
      'SELECT setting_key, value_json FROM system_settings',
    )
    for (const row of rows) {
      const key = row.setting_key as SiteSettingKey
      if (!SITE_SETTING_KEYS.includes(key)) continue
      const raw = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json
      ;(values as Record<SiteSettingKey, unknown>)[key] = settingValue(key, raw)
    }
    return values
  }

  const service: SettingsService = {
    async get() {
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
      const value = await load()
      cached = { at: Date.now(), value }
      return value
    },
    invalidate() {
      cached = null
    },
    async sessionConfig(base) {
      const s = await service.get()
      return {
        ...base,
        sessionHours: s['auth.session_hours'],
        sessionIdleMinutes: s['auth.idle_minutes'],
        rememberDays: s['auth.remember_days'],
      }
    },
  }
  return service
}
