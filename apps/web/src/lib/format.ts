import type { Locale } from '@testboard/shared'

/** UI timezone. API timestamps are always UTC ISO 8601; display is Asia/Jakarta (doc 10). */
export const DISPLAY_TIME_ZONE = 'Asia/Jakarta'

const INTL_LOCALE: Record<Locale, string> = { id: 'id-ID', en: 'en-GB' }

export function toLocale(language: string | undefined): Locale {
  return language === 'en' ? 'en' : 'id'
}

// Note: dateStyle/timeStyle cannot be combined with timeZoneName, so components are explicit.
export function formatDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: 'short',
  }).format(date)
}

/** Compact date + time (no seconds, no zone) for dense tables; full value goes in a tooltip. */
export function formatShortDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date)
}

export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date)
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)
}

/** `value` is already a percentage (0-100). */
export function formatPercent(value: number, locale: Locale, fractionDigits = 1): string {
  return (
    new Intl.NumberFormat(INTL_LOCALE[locale], {
      maximumFractionDigits: fractionDigits,
    }).format(value) + '%'
  )
}
