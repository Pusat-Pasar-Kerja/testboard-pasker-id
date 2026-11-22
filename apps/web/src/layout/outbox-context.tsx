import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isRetryable, readOutbox, writeOutbox, type OutboxEntry } from '../lib/outbox'
import { useDataSource } from '../services/use-data-source'
import { OutboxContext, type Outbox } from './outbox-state'

const FLUSH_EVERY_MS = 15_000

/** Keeps answers that could not be sent and sends them again when the connection is back. */
export function OutboxProvider({ tableId, children }: { tableId: string; children: ReactNode }) {
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<OutboxEntry[]>(() => readOutbox(tableId))
  const [rejected, setRejected] = useState<OutboxEntry[]>([])
  const [flushing, setFlushing] = useState(false)
  const busy = useRef(false)

  const update = useCallback(
    (next: OutboxEntry[]) => {
      writeOutbox(tableId, next)
      setPending(next)
    },
    [tableId],
  )

  const flush = useCallback(async () => {
    if (busy.current) return
    let queue = readOutbox(tableId)
    if (queue.length === 0) return
    busy.current = true
    setFlushing(true)
    let sent = 0
    try {
      for (const entry of [...queue]) {
        try {
          await ds.saveWorkshopResult(entry.run_case_id, entry.input)
          sent += 1
        } catch (error) {
          if (isRetryable(error)) break
          // Refused for good (e.g. the run was closed): tell the table, do not retry forever.
          setRejected((list) => [...list, entry])
        }
        queue = queue.filter((e) => e.client_id !== entry.client_id)
        update(queue)
      }
    } finally {
      busy.current = false
      setFlushing(false)
      if (sent > 0) await queryClient.invalidateQueries({ queryKey: ['workshop'] })
    }
  }, [ds, queryClient, tableId, update])

  useEffect(() => {
    // First attempt right after mount (not during the effect itself).
    const first = setTimeout(() => void flush(), 0)
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => {
      if (readOutbox(tableId).length > 0) void flush()
    }, FLUSH_EVERY_MS)
    return () => {
      clearTimeout(first)
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [flush, tableId])

  const value: Outbox = {
    pending,
    add: (entry) =>
      update([...readOutbox(tableId).filter((e) => e.client_id !== entry.client_id), entry]),
    flush,
  }

  return (
    <OutboxContext.Provider value={value}>
      <OutboxBanner
        pending={pending}
        rejected={rejected}
        flushing={flushing}
        onFlush={flush}
        onDismiss={() => setRejected([])}
      />
      {children}
    </OutboxContext.Provider>
  )
}

function OutboxBanner({
  pending,
  rejected,
  flushing,
  onFlush,
  onDismiss,
}: {
  pending: OutboxEntry[]
  rejected: OutboxEntry[]
  flushing: boolean
  onFlush: () => Promise<void>
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  if (pending.length === 0 && rejected.length === 0) return null
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-4">
      {pending.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-soft p-4 text-warning"
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CloudOff aria-hidden="true" className="size-6 shrink-0" />
            {t('easy.outbox.pending', { count: pending.length })}
          </p>
          <button
            type="button"
            onClick={() => void onFlush()}
            disabled={flushing}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-warning px-4 font-semibold text-white disabled:opacity-60"
          >
            {flushing ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-5" />
            )}
            {t('easy.outbox.sendNow')}
          </button>
        </div>
      )}
      {rejected.length > 0 && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-danger-soft p-4 text-danger"
        >
          <div>
            <p className="text-lg font-semibold">
              {t('easy.outbox.rejected', { count: rejected.length })}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {rejected.map((entry) => (
                <li key={entry.client_id}>{entry.title}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold hover:bg-danger/10"
          >
            <X aria-hidden="true" className="size-5" />
            {t('easy.outbox.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
