import type { Locale } from '@testboard/shared'

/** UI timezone. API timestamps are always UTC ISO 8601; display is Asia/Jakarta (doc 10). */
export const DISPLAY_TIME_ZONE = 'Asia/Jakarta'

const INTL_LOCALE: Record<Locale, string> = { id: 'id-ID', en: 'en-GB' }

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
