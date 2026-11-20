import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ToastContext, type ToastTone } from './toast-context'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

/** Short, polite notifications (doc 03 "toast yang ringkas"), announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++
      setItems((current) => [...current.slice(-2), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000)
    },
    [dismiss],
  )
  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-line bg-surface p-3 text-sm shadow-lg"
          >
            {item.tone === 'error' ? (
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-m-1 inline-flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-soft"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">{t('actions.close')}</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
