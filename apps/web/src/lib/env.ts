import { API_BASE_PATH, DEFAULT_LOCALE, isOneOf, LOCALES, type Locale } from '@testboard/shared'

/** Public, non-secret frontend configuration (all VITE_* values ship to the browser). */
export interface WebEnv {
  appName: string
  apiBaseUrl: string
  demoMode: boolean
  defaultLocale: Locale
}

export function readWebEnv(env: ImportMetaEnv = import.meta.env): WebEnv {
  const locale = env.VITE_DEFAULT_LOCALE
  return {
    appName: env.VITE_APP_NAME || 'TestBoard PASKER ID',
    apiBaseUrl: env.VITE_API_BASE_URL || API_BASE_PATH,
    // Demo (mock) mode is the safe default: no backend, no real data.
    demoMode: env.VITE_DEMO_MODE !== 'false',
    defaultLocale: isOneOf(LOCALES)(locale) ? locale : DEFAULT_LOCALE,
  }
}

export const webEnv = readWebEnv()
