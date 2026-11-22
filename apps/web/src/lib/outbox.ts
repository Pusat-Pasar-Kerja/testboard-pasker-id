import type { WorkshopResultInput } from '@testboard/shared'
import { ApiClientError } from '../services/api-client'

/**
 * Answers waiting to be sent from a table device (venue Wi-Fi drops). Kept in this browser
 * only, per table; each carries its client id, so sending it twice still saves it once.
 */
export interface OutboxEntry {
  client_id: string
  run_case_id: string
  module_id: string
  title: string
  input: WorkshopResultInput
  queued_at: string
}

const key = (tableId: string) => `tb.meja.${tableId}.outbox`

export function readOutbox(tableId: string): OutboxEntry[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key(tableId)) ?? '[]') as unknown
    return Array.isArray(value) ? (value as OutboxEntry[]) : []
  } catch {
    return []
  }
}

export function writeOutbox(tableId: string, entries: OutboxEntry[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(key(tableId))
    else window.localStorage.setItem(key(tableId), JSON.stringify(entries))
  } catch {
    // Storage blocked: the entries stay in memory for this page only.
  }
}

/** No connection, or the server / proxy is briefly unavailable: worth trying again later. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiClientError) return error.status === 0 || error.status >= 502
  return error instanceof TypeError
}
