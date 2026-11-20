import { isOneOf, LOCALES, type Locale } from '@testboard/shared'
import i18next, { type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import idCommon from './locales/id/common.json'

export const resources = {
  id: { common: idCommon },
  en: { common: enCommon },
} as const

const STORAGE_KEY = 'tb.locale'
const isLocale = isOneOf(LOCALES)

/**
 * Guest/UI preference only. Once auth lands (Milestone 2) the authoritative value is
 * users.preferred_locale from the profile; this is just a per-browser convenience.
 */
export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Storage may be unavailable (private mode); the switch still applies for this session.
  }
}

export function createI18n(initialLocale: Locale): i18n {
  const instance = i18next.createInstance()
  void instance.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: 'id',
    supportedLngs: [...LOCALES],
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false }, // React already escapes output.
    returnNull: false,
    initAsync: false,
    showSupportNotice: false,
  })
  instance.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
  document.documentElement.lang = initialLocale
  return instance
}
