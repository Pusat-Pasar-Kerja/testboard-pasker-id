import { useState } from 'react'
import type { RowSelection } from '../components/ui/ResponsiveTable'

/**
 * Checkbox selection for a paged list (bulk actions, ADR 0013). The selection survives
 * paging, so items from several pages can be changed together; changing a filter
 * (`resetKey`) starts a fresh selection so nothing hidden is changed by accident.
 */
export function useRowSelection<T>(
  rows: T[],
  key: (row: T) => string,
  labels: { row: (row: T) => string; all: string },
  resetKey: string,
) {
  const [state, setState] = useState<{ resetKey: string; items: Map<string, T> }>({
    resetKey,
    items: new Map(),
  })
  const selected = state.resetKey === resetKey ? state.items : new Map<string, T>()
  const update = (next: Map<string, T>) => setState({ resetKey, items: next })

  const visible = rows.map(key)
  const allSelected = visible.length > 0 && visible.every((id) => selected.has(id))
  const selection: RowSelection<T> = {
    isSelected: (row) => selected.has(key(row)),
    onToggle: (row) => {
      const next = new Map(selected)
      const id = key(row)
      if (next.has(id)) next.delete(id)
      else next.set(id, row)
      update(next)
    },
    onToggleAll: () => {
      const next = new Map(selected)
      for (const row of rows) {
        if (allSelected) next.delete(key(row))
        else next.set(key(row), row)
      }
      update(next)
    },
    allSelected,
    someSelected: visible.some((id) => selected.has(id)),
    rowLabel: labels.row,
    allLabel: labels.all,
  }
  return {
    ids: [...selected.keys()],
    rows: [...selected.values()],
    selection,
    clear: () => update(new Map()),
  }
}
