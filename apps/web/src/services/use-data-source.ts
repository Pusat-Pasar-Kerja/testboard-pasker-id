import { createContext, useContext } from 'react'
import type { DataSource } from './data-source'

export const DataSourceContext = createContext<DataSource | null>(null)

export function useDataSource(): DataSource {
  const value = useContext(DataSourceContext)
  if (!value) throw new Error('useDataSource must be used inside <DataSourceProvider>')
  return value
}
