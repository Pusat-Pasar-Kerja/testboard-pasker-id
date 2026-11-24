import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider } from 'react-router'
import { createI18n, readStoredLocale } from './i18n'
import { webEnv } from './lib/env'
import { ToastProvider } from './components/ui/Toast'
import { createAppRouter } from './router'
import { createApiClient } from './services/api-client'
import { createHttpDataSource } from './services/data-source'
import { DataSourceProvider } from './services/data-source-context'
import { createMockDataSource } from './services/mock-data-source'
import '@fontsource-variable/inter/wght.css'
// Readable letters for the accessibility option; downloaded only when switched on.
import '@fontsource/atkinson-hyperlegible/latin-400.css'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import { startA11y } from './lib/a11y'
import { SiteDefaultLocale } from './components/SiteDefaultLocale'
import './styles.css'

startA11y()
const i18n = createI18n(readStoredLocale() ?? webEnv.defaultLocale)
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})
const dataSource = webEnv.demoMode
  ? createMockDataSource()
  : createHttpDataSource(createApiClient(webEnv.apiBaseUrl))
const router = createAppRouter()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <DataSourceProvider value={dataSource}>
          <ToastProvider>
            <SiteDefaultLocale />
            <RouterProvider router={router} />
          </ToastProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
)
