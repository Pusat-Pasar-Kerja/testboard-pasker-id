import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePublicSettings } from '../hooks/queries'
import { readStoredLocale } from '../i18n'

/**
 * "Bahasa bawaan" from the website settings (audit 2026-11-24: the setting had no effect).
 * Applies only to a visitor who never chose a language on this device; a chosen language
 * (or the one from a signed-in profile) always wins. Renders nothing.
 */
export function SiteDefaultLocale() {
  const { i18n } = useTranslation()
  const settings = usePublicSettings()
  const siteLocale = settings.data?.['site.default_locale']
  useEffect(() => {
    if (!siteLocale || readStoredLocale()) return
    if (i18n.resolvedLanguage !== siteLocale) void i18n.changeLanguage(siteLocale)
  }, [siteLocale, i18n])
  return null
}
