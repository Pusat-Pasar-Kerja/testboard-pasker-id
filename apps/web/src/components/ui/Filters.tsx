import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const control =
  'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand-600'

/**
 * One row of filters above the content they scope (wraps on small screens). `more` holds
 * the filters people rarely need behind "Saring lebih lanjut" (owner, 2026-11-24: users
 * first, so a list does not start with a wall of dropdowns); it opens by itself while one
 * of them is in use (`moreActive` = how many).
 */
export function FilterBar({
  children,
  more,
  moreActive = 0,
  onReset,
}: {
  children: ReactNode
  more?: ReactNode
  moreActive?: number
  onReset?: () => void
}) {
  const { t } = useTranslation()
  const panelId = useId()
  const [open, setOpen] = useState(moreActive > 0)
  // A filter set from a link or the back button opens the panel too.
  const [seen, setSeen] = useState(moreActive)
  if (seen !== moreActive) {
    setSeen(moreActive)
    if (moreActive > 0) setOpen(true)
  }
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {more && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-neutral-soft"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4 text-ink-muted" />
            {t('filters.more')}
            {moreActive > 0 && (
              <span className="min-w-5 rounded-full bg-brand-700 px-1.5 text-center text-xs font-semibold text-white tabular-nums">
                {moreActive}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className={`size-4 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
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
      {more && (
        <div
          id={panelId}
          hidden={!open}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3"
        >
          {more}
        </div>
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

/** Calendar day filter (YYYY-MM-DD, interpreted as WIB by the API). */
export function DateFilter({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}) {
  const id = useId()
  return (
    <div className="w-[calc(50%-0.375rem)] min-w-36 sm:w-44">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={control}
      />
    </div>
  )
}
