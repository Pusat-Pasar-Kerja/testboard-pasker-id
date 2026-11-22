import { createContext, useContext } from 'react'
import type { OutboxEntry } from '../lib/outbox'

export interface Outbox {
  pending: OutboxEntry[]
  add: (entry: OutboxEntry) => void
  flush: () => Promise<void>
}

export const OutboxContext = createContext<Outbox | null>(null)

/** Answers of this table waiting to be sent (only inside Mode Mudah). */
export function useOutbox(): Outbox {
  const outbox = useContext(OutboxContext)
  if (!outbox) throw new Error('useOutbox outside OutboxProvider')
  return outbox
}
