import { LOCALES, type Locale } from '@testboard/shared'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { storeLocale } from '../i18n'

/** Switches UI language instantly (no reload). Content of test cases is never auto-translated. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage as Locale

  function select(locale: Locale) {
    void i18n.changeLanguage(locale)
    storeLocale(locale)
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
            className={`min-h-9 min-w-11 rounded-md px-2 text-sm font-semibold uppercase transition-colors ${
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
