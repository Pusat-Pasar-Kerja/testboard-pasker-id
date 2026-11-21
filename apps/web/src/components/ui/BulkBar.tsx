import type { BulkResult } from '@testboard/shared'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

export const BULK_SELECT =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand-600'

/** Bar shown while rows are selected: how many, the actions, and "clear selection". */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label={t('bulk.selected', { count })}
      className="sticky top-2 z-20 mb-4 flex animate-fade-in flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 shadow-sm"
    >
      <span className="mr-auto text-sm font-semibold text-brand-800">
        {t('bulk.selected', { count })}
      </span>
      {children}
      <Button variant="ghost" icon={X} onClick={onClear}>
        {t('bulk.clear')}
      </Button>
    </div>
  )
}

const KNOWN_REASONS = [
  'NOT_FOUND',
  'FORBIDDEN',
  'INVALID_TRANSITION',
  'ARCHIVED',
  'NOT_READY',
  'CONFLICT',
  'VALIDATION_ERROR',
] as const

/** What happened: changed / already so / skipped (with the reason per item). */
export function BulkReport({ result, onClose }: { result: BulkResult; onClose: () => void }) {
  const { t } = useTranslation()
  const reason = (code: string) =>
    (KNOWN_REASONS as readonly string[]).includes(code)
      ? t(`bulk.reasons.${code as (typeof KNOWN_REASONS)[number]}`)
      : code
  return (
    <div
      role="status"
      className="mb-4 animate-fade-in rounded-xl border border-line bg-surface p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <p className="mr-auto">
          {t('bulk.report', {
            updated: result.updated,
            unchanged: result.unchanged,
            skipped: result.skipped.length,
          })}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('actions.close')}</span>
        </button>
      </div>
      {result.skipped.length > 0 && (
        <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-ink-muted">
          {result.skipped.map((item) => (
            <li key={item.id}>
              <span className="font-mono">{item.code || item.id}</span>: {reason(item.reason)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
