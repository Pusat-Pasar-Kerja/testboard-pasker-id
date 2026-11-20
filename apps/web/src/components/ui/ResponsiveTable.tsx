import type { ReactNode } from 'react'
import { Link } from 'react-router'

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
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  rowLink: (row: T) => string
  primary: (row: T) => { code?: string; title: ReactNode }
  cardFields: (row: T) => ReactNode
  caption: string
}) {
  const hide = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-xs tracking-wide text-ink-muted uppercase">
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
                className="border-b border-line last:border-0 hover:bg-brand-50/60"
              >
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
            <li key={rowKey(row)}>
              <Link
                to={rowLink(row)}
                className="block rounded-lg border border-line bg-surface p-3 hover:border-brand-300"
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
