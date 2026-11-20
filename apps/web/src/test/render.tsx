import type { Locale } from '@testboard/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createI18n } from '../i18n'
import { createMockDataSource, type DataSource } from '../services/data-source'
import { DataSourceProvider } from '../services/data-source-context'

export function renderWithProviders(
  ui: ReactElement,
  {
    locale = 'id',
    dataSource = createMockDataSource({ latencyMs: 0 }),
  }: { locale?: Locale; dataSource?: DataSource } = {},
) {
  const i18n = createI18n(locale)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    i18n,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <DataSourceProvider value={dataSource}>{ui}</DataSourceProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  }
}
