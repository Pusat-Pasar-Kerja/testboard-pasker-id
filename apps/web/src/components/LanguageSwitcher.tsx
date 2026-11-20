import { LOCALES, type CurrentUser, type Locale } from '@testboard/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { storeLocale } from '../i18n'
import { useDataSource } from '../services/use-data-source'

/**
 * Switches UI language instantly (no reload). When signed in, the choice is saved to the
 * profile (users.preferred_locale) so it follows the user to other devices (doc 10).
 * Content of test cases is never auto-translated.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const current = i18n.resolvedLanguage as Locale

  function select(locale: Locale) {
    void i18n.changeLanguage(locale)
    storeLocale(locale)
    const me = queryClient.getQueryData<CurrentUser | null>(['me'])
    if (me && me.preferred_locale !== locale) {
      ds.updateProfile({ preferred_locale: locale })
        .then((user) => queryClient.setQueryData(['me'], user))
        .catch(() => undefined) // UI already switched; the profile sync is best effort.
    }
  }

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1"
    >
      <Languages aria-hidden="true" className="mx-1 hidden size-4 text-ink-muted sm:block" />
      {LOCALES.map((locale) => {
        const active = locale === current
        return (
          <button
            key={locale}
            type="button"
            onClick={() => select(locale)}
            aria-pressed={active}
            aria-label={t('language.switchTo', { language: t(`language.${locale}`) })}
            className={`min-h-9 min-w-11 rounded-md px-2 text-sm font-semibold uppercase ${
              active ? 'bg-brand-700 text-white' : 'text-ink hover:bg-brand-100'
            }`}
          >
            {locale}
          </button>
        )
      })}
    </div>
  )
}
