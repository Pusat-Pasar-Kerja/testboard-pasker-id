import { useTranslation } from 'react-i18next'
import { useFontScale } from '../lib/font-scale'

/** A- / A / A+ : bigger letters for readers who need them (kept per browser). */
export function FontSizeControl({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const font = useFontScale()
  const button =
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 font-semibold text-ink hover:bg-neutral-soft disabled:opacity-40'
  return (
    <div
      role="group"
      aria-label={t('fontSize.label')}
      className={`inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 ${className}`}
    >
      <button
        type="button"
        className={`${button} text-xs`}
        onClick={font.shrink}
        disabled={!font.canShrink}
        aria-label={t('fontSize.smaller')}
      >
        A−
      </button>
      <button
        type="button"
        className={`${button} text-sm`}
        onClick={font.reset}
        aria-label={t('fontSize.normal')}
        aria-pressed={font.scale === 1}
      >
        A
      </button>
      <button
        type="button"
        className={`${button} text-base`}
        onClick={font.grow}
        disabled={!font.canGrow}
        aria-label={t('fontSize.larger')}
      >
        A+
      </button>
    </div>
  )
}
