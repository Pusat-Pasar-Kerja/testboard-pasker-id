import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { App } from './App'
import { createI18n, readStoredLocale } from './i18n'
import { webEnv } from './lib/env'
import { createApiClient } from './services/api-client'
import { createHttpDataSource, createMockDataSource } from './services/data-source'
import { DataSourceProvider } from './services/data-source-context'
import './styles.css'

const i18n = createI18n(readStoredLocale() ?? webEnv.defaultLocale)
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})
const dataSource = webEnv.demoMode
  ? createMockDataSource()
  : createHttpDataSource(createApiClient(webEnv.apiBaseUrl))

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <DataSourceProvider value={dataSource}>
          <App />
        </DataSourceProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
)
