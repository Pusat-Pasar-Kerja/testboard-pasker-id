import { FlaskConical, PlugZap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiHealthCard } from './components/ApiHealthCard'
import { TestBoardLogo } from './components/brand/TestBoardLogo'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useDataSource } from './services/use-data-source'

export function App() {
  const { t } = useTranslation()
  const dataSource = useDataSource()
  const demo = dataSource.kind === 'mock'

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <TestBoardLogo size="md" />
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <p
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            demo ? 'bg-warning/10 text-warning' : 'bg-brand-100 text-brand-700'
          }`}
        >
          {demo ? (
            <FlaskConical aria-hidden="true" className="size-4" />
          ) : (
            <PlugZap aria-hidden="true" className="size-4" />
          )}
          {demo ? t('mode.demo') : t('mode.live')}
        </p>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{t('app.title')}</h1>
          <p className="text-ink-muted">{t('app.tagline')}</p>
        </div>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold">{t('foundation.heading')}</h2>
          <p className="mt-2 text-sm text-ink-muted">{t('foundation.description')}</p>
        </section>

        <ApiHealthCard />
      </main>
    </div>
  )
}
