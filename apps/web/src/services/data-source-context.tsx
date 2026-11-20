import type { ReactNode } from 'react'
import type { DataSource } from './data-source'
import { DataSourceContext } from './use-data-source'

export function DataSourceProvider({
  value,
  children,
}: {
  value: DataSource
  children: ReactNode
}) {
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>
}
