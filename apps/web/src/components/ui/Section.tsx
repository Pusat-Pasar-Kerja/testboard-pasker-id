import type { ReactNode } from 'react'

/** Card-like content section with an optional heading row. */
export function Section({
  title,
  description,
  action,
  children,
  className = '',
  headingLevel = 2,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className={`rounded-xl border border-line bg-surface shadow-xs ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="space-y-0.5">
            {title && <Heading className="text-base font-semibold">{title}</Heading>}
            {description && <p className="text-xs text-ink-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/** Two-column label/value list that collapses to one column on small screens. */
export function DescriptionList({
  items,
}: {
  items: { label: ReactNode; value: ReactNode; wide?: boolean }[]
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item, index) => (
        <div key={index} className={item.wide ? 'sm:col-span-2' : undefined}>
          <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm break-words whitespace-pre-line">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
