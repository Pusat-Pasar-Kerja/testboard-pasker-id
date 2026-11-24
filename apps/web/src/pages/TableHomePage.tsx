import { ArrowRight, CircleAlert, ListChecks, MessageSquareWarning } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { TesterPicker } from '../components/workshop/TesterPicker'
import { useTesterName } from '../components/workshop/use-tester-name'
import { useTableSession } from '../layout/table-session'
import { formatDateTime, toLocale } from '../lib/format'

/** Mode Mudah home: who is answering, the features of this table, and the problem list. */
export function TableHomePage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const session = useTableSession()
  const tester = useTesterName(session.table.id)
  const runOpen = session.run?.status_code === 'ACTIVE'

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-pastel-lavender to-pastel-sky p-6 sm:p-8">
        <h1 className="text-3xl font-bold">
          {t('easy.home.welcome', { name: session.table.name })}
        </h1>
        <p className="mt-2 text-lg">
          {t('easy.home.intro', {
            cycle: session.run?.name ?? session.cycle.title,
            project: session.project.name,
          })}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {t('easy.home.validUntil', { date: formatDateTime(session.valid_until, locale) })}
        </p>
      </section>

      {!runOpen && (
        <p className="flex items-start gap-3 rounded-2xl bg-warning-soft p-5 text-lg text-warning">
          <CircleAlert aria-hidden="true" className="mt-1 size-6 shrink-0" />
          {t(session.run ? 'easy.home.runClosed' : 'easy.home.noRun')}
        </p>
      )}

      <TesterPicker members={session.table.members} tester={tester} />

      <section aria-labelledby="fitur-meja">
        <h2 id="fitur-meja" className="flex items-center gap-2 text-2xl font-bold">
          <ListChecks aria-hidden="true" className="size-7 text-brand-700" />
          {t('easy.home.featuresTitle')}
        </h2>
        <p className="mt-1 text-ink-muted">{t('easy.home.featuresHint')}</p>
        {session.features.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-surface p-5 text-lg">
            {t('easy.home.noFeatures')}
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {session.features.map((feature) => {
              const done =
                feature.progress.total > 0 && feature.progress.tried === feature.progress.total
              const started = feature.progress.tried > 0
              return (
                <li
                  key={feature.module.id}
                  className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
                >
                  <h3 className="text-2xl font-semibold">{feature.module.name}</h3>
                  <div className="mt-3">
                    <ProgressMeter counts={feature.progress} size="lg" legend />
                  </div>
                  <Link
                    to={`/meja/kerja/fitur/${feature.module.id}`}
                    className={`mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 text-xl font-semibold sm:w-auto ${
                      done
                        ? 'border border-line-strong bg-surface text-ink hover:bg-neutral-soft'
                        : 'bg-brand-700 text-white shadow-sm hover:bg-brand-800'
                    }`}
                  >
                    {t(
                      done
                        ? 'easy.home.review'
                        : started
                          ? 'easy.home.continue'
                          : 'easy.home.start',
                    )}
                    <ArrowRight aria-hidden="true" className="size-6" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareWarning aria-hidden="true" className="size-5 text-pastel-peach-ink" />
          {t('easy.home.bugsTitle')}
        </h2>
        <p className="mt-1 text-ink-muted">{t('easy.home.bugsHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/meja/kerja/masalah"
            className="inline-flex min-h-12 items-center rounded-xl border border-line-strong px-5 font-semibold hover:bg-neutral-soft"
          >
            {t('easy.home.seeBugs')}
          </Link>
          <Link
            to="/meja/kerja/masalah?baru=1"
            className="inline-flex min-h-12 items-center rounded-xl border border-line-strong px-5 font-semibold hover:bg-neutral-soft"
          >
            {t('easy.home.reportOther')}
          </Link>
        </div>
      </section>
    </div>
  )
}
