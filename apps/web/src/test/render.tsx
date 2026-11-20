import type { Locale } from '@testboard/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { ToastProvider } from '../components/ui/Toast'
import { createI18n } from '../i18n'
import { routes } from '../router'
import type { DataSource } from '../services/data-source'
import { DataSourceProvider } from '../services/data-source-context'
import { createMockDataSource } from '../services/mock-data-source'

/** Renders the real route tree at `path` with mock data and no artificial latency. */
export function renderRoute(
  path: string,
  {
    locale = 'id',
    dataSource = createMockDataSource({ latencyMs: 0 }),
  }: { locale?: Locale; dataSource?: DataSource } = {},
) {
  const i18n = createI18n(locale)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    i18n,
    router,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <DataSourceProvider value={dataSource}>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </DataSourceProvider>
        </QueryClientProvider>
      </I18nextProvider>,
    ),
  }
}
