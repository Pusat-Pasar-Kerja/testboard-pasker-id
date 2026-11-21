import { useId, useRef, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '../../hooks/use-focus-trap'
import { Button } from './Button'

/** Modal with a small form (create/edit). Portalled like ConfirmDialog; Esc cancels. */
export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  busy = false,
  hideCancel = false,
  onSubmit,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  submitLabel: string
  busy?: boolean
  /** Only the submit button (e.g. a "Done" step that shows a result). */
  hideCancel?: boolean
  onSubmit: () => void
  onCancel: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(open, ref, busy ? () => {} : onCancel, 'input, textarea, select')
  if (!open) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!busy) onSubmit()
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]"
        onClick={busy ? undefined : onCancel}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg animate-pop-in rounded-2xl bg-surface p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          {children}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            {!hideCancel && (
              <Button variant="secondary" onClick={onCancel} disabled={busy}>
                {t('actions.cancel')}
              </Button>
            )}
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
