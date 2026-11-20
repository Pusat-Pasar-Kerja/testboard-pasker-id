import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Optional row selection for bulk actions (a checkbox column / a checkbox beside each card). */
export interface RowSelection<T> {
  isSelected: (row: T) => boolean
  onToggle: (row: T) => void
  onToggleAll: () => void
  allSelected: boolean
  someSelected: boolean
  rowLabel: (row: T) => string
  allLabel: string
}

const CHECKBOX = 'size-4.5 rounded border-line-strong accent-brand-700'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Hide below this breakpoint in the table view (cards always show `cardFields`). */
  hideBelow?: 'lg' | 'xl'
  className?: string
}

/**
 * Table on md+ screens, stacked cards on phones (no horizontal page overflow at 375px).
 * `rowLink` makes the primary cell a real link so rows are keyboard-reachable.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  rowLink,
  primary,
  cardFields,
  caption,
  selection,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  rowLink: (row: T) => string
  primary: (row: T) => { code?: string; title: ReactNode }
  cardFields: (row: T) => ReactNode
  caption: string
  selection?: RowSelection<T>
}) {
  const hide = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-xs tracking-wide text-ink-muted uppercase">
              {selection && (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    aria-label={selection.allLabel}
                    checked={selection.allSelected}
                    ref={(element) => {
                      if (element)
                        element.indeterminate = selection.someSelected && !selection.allSelected
                    }}
                    onChange={selection.onToggleAll}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-3 py-2 font-medium ${column.hideBelow ? hide[column.hideBelow] : ''} ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-b border-line last:border-0 hover:bg-brand-50/60 ${
                  selection?.isSelected(row) ? 'bg-brand-50/70' : ''
                }`}
              >
                {selection && (
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label={selection.rowLabel(row)}
                      checked={selection.isSelected(row)}
                      onChange={() => selection.onToggle(row)}
                    />
                  </td>
                )}
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2.5 align-top ${column.hideBelow ? hide[column.hideBelow] : ''} ${column.className ?? ''}`}
                  >
                    {index === 0 ? (
                      <Link
                        to={rowLink(row)}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {column.render(row)}
                      </Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const head = primary(row)
          return (
            <li key={rowKey(row)} className="flex items-start gap-2">
              {selection && (
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    aria-label={selection.rowLabel(row)}
                    checked={selection.isSelected(row)}
                    onChange={() => selection.onToggle(row)}
                  />
                </label>
              )}
              <Link
                to={rowLink(row)}
                className="block min-w-0 flex-1 rounded-lg border border-line bg-surface p-3 hover:border-brand-200 hover:shadow-sm"
              >
                {head.code && (
                  <span className="text-xs font-semibold text-brand-700">{head.code}</span>
                )}
                <span className="mt-0.5 block text-sm font-medium break-words">{head.title}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2">{cardFields(row)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
