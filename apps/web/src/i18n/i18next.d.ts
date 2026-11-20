import 'i18next'
import type { resources } from './index'

// Type-safe translation keys: t('foundation.heading') is checked at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['id']
  }
}
