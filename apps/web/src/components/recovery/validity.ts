import type { TFunction } from 'i18next'
import { useEffect, useState } from 'react'

/** Current time, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** "2 hari 3 jam" / "5 jam 12 menit" / "8 menit" / "kurang dari 1 menit". */
export function formatRemaining(t: TFunction, ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return t('recovery.duration.daysHours', { days, hours })
  if (hours > 0) return t('recovery.duration.hoursMinutes', { hours, minutes: mins })
  if (mins > 0) return t('recovery.duration.minutes', { minutes: mins })
  return t('recovery.duration.lessThanMinute')
}
