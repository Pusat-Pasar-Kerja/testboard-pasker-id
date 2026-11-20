import { Search, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const control =
  'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand-600'

/** One row of filters above the content they scope (wraps on small screens). */
export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <X aria-hidden="true" className="size-4" />
          {t('actions.resetFilters')}
        </button>
      )}
    </div>
  )
}

/** Search box that commits on submit (Enter) so typing does not refetch per keystroke. */
export function SearchField({
  label,
  placeholder,
  value,
  onSearch,
}: {
  label: string
  placeholder: string
  value: string
  onSearch: (value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState(value)
  // Re-sync when the committed value changes from outside (e.g. "clear filters", back button).
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }

  return (
    <form
      role="search"
      className="w-full min-w-56 flex-1 sm:w-auto sm:max-w-sm"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(draft.trim())
      }}
    >
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <div className="flex">
        <input
          id={id}
          type="search"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          className={`${control} rounded-r-none`}
        />
        <button
          type="submit"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-lg border border-l-0 border-line-strong bg-brand-700 text-white hover:bg-brand-800"
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('actions.search')}</span>
        </button>
      </div>
    </form>
  )
}

export function SelectFilter({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  allLabel?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="w-[calc(50%-0.375rem)] min-w-36 sm:w-44">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={control}
      >
        <option value="">{allLabel ?? t('filters.all')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
