import { useTranslation } from 'react-i18next'

/**
 * One filter as a row of buttons ("Semua · Siap · Draf"): every choice is visible and one
 * tap away, easier than a drop-down for older testers (owner, 2026-11-24). The pressed
 * button is the active filter; "Semua" clears it.
 */
export function ChipFilter({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string
  value: string
  options: { value: string; label: string; count?: number }[]
  onChange: (value: string) => void
  allLabel?: string
}) {
  const { t } = useTranslation()
  const choices = [{ value: '', label: allLabel ?? t('filters.all') }, ...options]
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink-muted">{label}:</span>
      {choices.map((choice) => {
        const pressed = choice.value === value
        return (
          <button
            key={choice.value || 'all'}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(choice.value)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
              pressed
                ? 'border-brand-700 bg-brand-700 font-semibold text-white'
                : 'border-line-strong bg-surface text-ink hover:bg-brand-50'
            }`}
          >
            {choice.label}
            {choice.count !== undefined && (
              <span className={`tabular-nums ${pressed ? 'text-white/85' : 'text-ink-muted'}`}>
                {choice.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
