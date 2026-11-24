import { LOCALES, type CurrentUser, type Locale } from '@testboard/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { storeLocale } from '../../i18n'
import { useDataSource } from '../../services/use-data-source'

/** Each language is named in its own words, so anyone can find theirs. */
const NATIVE: Record<Locale, string> = { id: 'Bahasa Indonesia', en: 'English' }

/**
 * The language choice, inside Aksesibilitas (owner, 2026-11-24: "bahasa en-id bisa masuk
 * bagian aksesibilitas"). Switches at once (no reload). When signed in, the choice is saved
 * to the profile (users.preferred_locale) so it follows the user to other devices (doc 10).
 * Content of test cases is never auto-translated.
 */
export function LanguageChoice() {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const current = i18n.resolvedLanguage as Locale

  function select(locale: Locale) {
    void i18n.changeLanguage(locale)
    storeLocale(locale)
    const me = queryClient.getQueryData<CurrentUser | null>(['me'])
    if (me && me.account_kind !== 'TABLE' && me.preferred_locale !== locale) {
      ds.updateProfile({ preferred_locale: locale })
        .then((user) => queryClient.setQueryData(['me'], user))
        .catch(() => undefined) // UI already switched; the profile sync is best effort.
    }
  }

  return (
    <div role="radiogroup" aria-label={t('language.title')} className="grid grid-cols-2 gap-2">
      {LOCALES.map((locale) => {
        const active = locale === current
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            lang={locale}
            onClick={() => select(locale)}
            className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${
              active ? 'border-brand-700 bg-brand-50' : 'border-line hover:bg-neutral-soft'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase ${
                active ? 'bg-brand-700 text-white' : 'bg-neutral-soft text-ink'
              }`}
            >
              {locale}
            </span>
            <span className="font-semibold text-ink">{NATIVE[locale]}</span>
          </button>
        )
      })}
    </div>
  )
}
