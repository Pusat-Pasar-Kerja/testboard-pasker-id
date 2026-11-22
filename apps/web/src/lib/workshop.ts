import type { ExecutionStatus, ResultCounts, StatusCounts } from '@testboard/shared'

/** Progress counts of a table / feature in the shape the status bar draws. */
export function toStatusCounts(c: ResultCounts): StatusCounts {
  return {
    PASSED: c.passed,
    FAILED: c.failed,
    BLOCKED: c.blocked,
    SKIPPED: c.skipped,
    IN_PROGRESS: 0,
    NOT_RUN: Math.max(0, c.total - c.tried),
  }
}

export const triedPercent = (c: ResultCounts): number =>
  c.total === 0 ? 0 : Math.round((c.tried / c.total) * 100)

/** "246810" -> "246 810": easier to read aloud and to type from a card. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

/** Where a table card's QR code points: the join page, with the code after "#". */
export function cardUrl(code: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}/meja#${code}`
}

/** Short address printed on the card for people typing it by hand. */
export function joinAddress(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.host}${base}/meja`
}

/** Plain-language result of a scenario as shown to participants. */
export type EasyResult = 'PASSED' | 'FAILED' | 'BLOCKED'
export const isAnswered = (status: ExecutionStatus | undefined | null) =>
  Boolean(status) && status !== 'NOT_RUN' && status !== 'IN_PROGRESS'

const testerKey = (tableId: string) => `tb.meja.${tableId}.tester`

/** Who is answering on this device ("Yang mengisi"), remembered per table. */
export function readTesterName(tableId: string): string | null {
  try {
    return window.localStorage.getItem(testerKey(tableId))
  } catch {
    return null
  }
}

export function storeTesterName(tableId: string, name: string | null): void {
  try {
    if (name) window.localStorage.setItem(testerKey(tableId), name)
    else window.localStorage.removeItem(testerKey(tableId))
  } catch {
    // Not stored: the name is asked again next time.
  }
}

/** A random id so a retried answer (bad connection) is saved once. */
export function clientId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Date-time for an <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
