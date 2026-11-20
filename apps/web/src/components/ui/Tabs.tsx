import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  count?: number
  content: ReactNode
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern, manual activation with arrow keys).
 * The active tab is controlled by the caller so it can live in the URL.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  label: string
}) {
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0]

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    const tab = tabs[next]
    if (!tab) return
    onChange(tab.id)
    refs.current[next]?.focus()
  }

  if (!current) return null
  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === current.id
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[index] = element
              }}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap ${
                selected
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-neutral-soft px-1.5 text-xs tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div
        key={current.id}
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        tabIndex={0}
        className="animate-fade-in pt-5 focus-visible:outline-offset-4"
      >
        {current.content}
      </div>
    </div>
  )
}
