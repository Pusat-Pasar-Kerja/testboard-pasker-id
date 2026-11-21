import { z } from 'zod'
import type { IdString } from './api.js'
import { LOCALES } from './enums.js'

/**
 * Website settings a Super Admin can change from the admin console (ADR 0004 section 1,
 * ADR 0011). Stored in `system_settings` (one JSON value per key); every key has a strict
 * schema and a default, so the site works with an empty table. Changes take effect
 * within seconds, without a restart.
 */
export const SITE_SETTINGS = {
  'site.name': { schema: z.string().trim().min(1).max(80), default: 'TestBoard PASKER ID' },
  /** Banner shown to every signed-in user; empty = no banner. */
  'site.announcement': { schema: z.string().trim().max(500), default: '' },
  /** Language for visitors who have not chosen one yet. */
  'site.default_locale': { schema: z.enum(LOCALES), default: 'id' as (typeof LOCALES)[number] },
  /** How to reach the administrators (shown on the login and account recovery pages). */
  'site.support_contact': { schema: z.string().trim().max(300), default: '' },
  'auth.session_hours': { schema: z.number().int().min(1).max(72), default: 12 },
  'auth.idle_minutes': { schema: z.number().int().min(5).max(1440), default: 120 },
  /** How long a password reset link issued by a Super Admin stays valid (ADR 0012). */
  'recovery.link_hours': { schema: z.number().int().min(1).max(168), default: 24 },
  'retention.unused_file_days': { schema: z.number().int().min(7).max(3650), default: 90 },
  'retention.import_days': { schema: z.number().int().min(7).max(3650), default: 90 },
} as const

export type SiteSettingKey = keyof typeof SITE_SETTINGS
export type SiteSettings = { [K in SiteSettingKey]: z.infer<(typeof SITE_SETTINGS)[K]['schema']> }

export const SITE_SETTING_KEYS = Object.keys(SITE_SETTINGS) as SiteSettingKey[]

/** Keys anyone may read (login page, banner); everything else is Super Admin only. */
export const PUBLIC_SITE_SETTING_KEYS = [
  'site.name',
  'site.announcement',
  'site.default_locale',
  'site.support_contact',
] as const satisfies readonly SiteSettingKey[]

export type PublicSiteSettings = Pick<SiteSettings, (typeof PUBLIC_SITE_SETTING_KEYS)[number]>

export function defaultSiteSettings(): SiteSettings {
  return Object.fromEntries(
    SITE_SETTING_KEYS.map((key) => [key, SITE_SETTINGS[key].default]),
  ) as SiteSettings
}

/** Partial update: only the keys that change; each validated by its own schema. */
export const siteSettingsUpdateSchema = z
  .object(
    Object.fromEntries(
      SITE_SETTING_KEYS.map((key) => [key, SITE_SETTINGS[key].schema.optional()]),
    ) as { [K in SiteSettingKey]: z.ZodOptional<(typeof SITE_SETTINGS)[K]['schema']> },
  )
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')

export type SiteSettingsUpdate = z.input<typeof siteSettingsUpdateSchema>

export interface SiteSettingsDto {
  values: SiteSettings
  /** Last change per key (absent = still the default). */
  changed: Partial<
    Record<SiteSettingKey, { at: string; by: { id: IdString; display_name: string } | null }>
  >
}

/** Read a stored JSON value; anything invalid falls back to the default. */
export function settingValue<K extends SiteSettingKey>(key: K, stored: unknown): SiteSettings[K] {
  const parsed = SITE_SETTINGS[key].schema.safeParse(stored)
  return (parsed.success ? parsed.data : SITE_SETTINGS[key].default) as SiteSettings[K]
}
