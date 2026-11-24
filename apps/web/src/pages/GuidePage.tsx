import {
  BookOpen,
  Bug,
  CalendarRange,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  FlaskConical,
  Globe,
  ListChecks,
  LockKeyhole,
  LogIn,
  PlayCircle,
  Presentation,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import {
  ReportIllustration,
  TableGroupIllustration,
} from '../components/illustrations/GuideIllustrations'
import { WelcomeIllustration } from '../components/illustrations/WelcomeIllustration'
import { useCurrentUser } from '../hooks/queries'
import { AppShell } from '../layout/AppShell'
import { FirstLoad } from '../layout/FirstLoad'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'

type Item = { title: string; body: string }

type FlowKey = 'phase' | 'features' | 'uat' | 'people' | 'test' | 'bugs'
/** The Drive-like order of the work (ADR 0019): Fase > Fitur > Skenario, then UAT. */
const FLOW: { key: FlowKey; icon: LucideIcon }[] = [
  { key: 'phase', icon: CalendarRange },
  { key: 'features', icon: ListChecks },
  { key: 'uat', icon: PlayCircle },
  { key: 'people', icon: QrCode },
  { key: 'test', icon: Sparkles },
  { key: 'bugs', icon: Bug },
]

type SectionId =
  | 'cara-kerja'
  | 'masuk'
  | 'peserta'
  | 'penguji'
  | 'admin'
  | 'bug-reporting'
  | 'peran'
  | 'publik'
  | 'super-admin'
  | 'istilah'
  | 'privasi'

const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: 'cara-kerja', icon: BookOpen },
  { id: 'masuk', icon: LogIn },
  { id: 'peserta', icon: QrCode },
  { id: 'penguji', icon: FlaskConical },
  { id: 'admin', icon: Presentation },
  { id: 'bug-reporting', icon: Bug },
  { id: 'peran', icon: ShieldCheck },
  { id: 'publik', icon: Globe },
  { id: 'super-admin', icon: UserCog },
  { id: 'istilah', icon: ListChecks },
  { id: 'privasi', icon: LockKeyhole },
]

function Section({
  id,
  icon: Icon,
  title,
  intro,
  aside,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  intro?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-3xl card-pasker p-6 sm:p-8"
    >
      <div className={aside ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]' : ''}>
        <div>
          <h2
            id={`${id}-title`}
            className="flex items-center gap-3 text-2xl font-bold text-brand-800"
          >
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl chip-gradient">
              <Icon aria-hidden="true" className="size-6" />
            </span>
            {title}
          </h2>
          {intro && <p className="mt-3 max-w-3xl text-lg text-ink-muted">{intro}</p>}
        </div>
        {aside && <div className="hidden lg:block">{aside}</div>}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: Item[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-4">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">
            {index + 1}
          </span>
          <div>
            <p className="text-lg font-semibold">{item.title}</p>
            <p className="text-ink-muted">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-xl border border-line bg-surface p-4 open:bg-canvas"
        >
          <summary className="cursor-pointer list-none text-lg font-semibold marker:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            {item.q}
          </summary>
          <p className="mt-2 text-ink">{item.a}</p>
        </details>
      ))}
    </div>
  )
}

/**
 * "Panduan" opens in the frame the reader is already in: inside the app (sidebar and all)
 * for signed-in users, in the public frame for visitors and table participants, so the
 * screen never suddenly looks like another website (owner feedback 2026-11-24).
 */
export function GuidePage() {
  const me = useCurrentUser()
  if (me.isPending) return <FirstLoad />
  if (me.data && me.data.account_kind !== 'TABLE') {
    return (
      <AppShell>
        <GuideContent />
      </AppShell>
    )
  }
  return (
    <PublicSiteLayout>
      <GuideContent />
    </PublicSiteLayout>
  )
}

/** The guide, arranged by role (owner, 2026-11-24): how it works, then one part per role. */
function GuideContent() {
  const { t } = useTranslation()
  const { hash } = useLocation()
  // The page loads after the address: jump to the asked part once it is drawn.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''))
    if (id) document.getElementById(id)?.scrollIntoView?.({ block: 'start' })
  }, [hash])
  // Arrays of steps / questions live in the translation files (returnObjects).
  const tx = t as unknown as (key: string, options: { returnObjects: true }) => unknown
  const list = <T,>(key: string) => tx(key, { returnObjects: true }) as T[]

  return (
    <>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-teal-700 uppercase">
          {t('guide.eyebrow')}
        </p>
        <h1 className="mt-1 text-4xl font-bold text-brand-800">{t('guide.title')}</h1>
        <p className="mt-3 text-lg text-ink-muted">{t('guide.subtitle')}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t('guide.toc')} className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-semibold text-ink-muted">{t('guide.toc')}</p>
          <ul className="space-y-0.5">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 font-medium hover:bg-brand-50"
                >
                  <section.icon aria-hidden="true" className="size-5 text-brand-700" />
                  {t(`guide.sections.${section.id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-8">
          <Section
            id="cara-kerja"
            icon={BookOpen}
            title={t('guide.sections.cara-kerja')}
            intro={t('guide.flow.intro')}
          >
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {FLOW.map((step, index) => (
                <li key={step.key} className="rounded-2xl border border-line bg-surface p-4">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <step.icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="text-sm font-semibold text-ink-muted">
                      {t('guide.stepNumber', { n: index + 1 })}
                    </span>
                  </span>
                  <p className="mt-2 text-lg font-semibold">{t(`guide.flow.${step.key}.title`)}</p>
                  <p className="text-sm font-medium text-teal-700">
                    {t(`guide.flow.${step.key}.menu`)}
                  </p>
                  <p className="mt-1 text-ink-muted">{t(`guide.flow.${step.key}.body`)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-xl bg-info-soft p-4 text-info">{t('guide.flow.example')}</p>
          </Section>

          <Section
            id="masuk"
            icon={LogIn}
            title={t('guide.sections.masuk')}
            intro={t('guide.signIn.intro')}
            aside={<WelcomeIllustration className="w-full" />}
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                  <QrCode aria-hidden="true" className="size-5 text-brand-700" />
                  {t('guide.signIn.tableTitle')}
                </h3>
                <Steps items={list<Item>('guide.signIn.tableSteps')} />
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                  <Users aria-hidden="true" className="size-5 text-brand-700" />
                  {t('guide.signIn.userTitle')}
                </h3>
                <Steps items={list<Item>('guide.signIn.userSteps')} />
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-pastel-sky p-5 text-pastel-sky-ink">
              <h3 className="text-lg font-semibold">{t('guide.signIn.activationTitle')}</h3>
              <p className="mt-1">{t('guide.signIn.activationBody')}</p>
              <ul className="mt-3 space-y-2">
                {list<Item>('guide.signIn.activationSteps').map((item) => (
                  <li key={item.title}>
                    <span className="font-semibold">{item.title}: </span>
                    {item.body}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/masuk"
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
            >
              <LogIn aria-hidden="true" className="size-5" />
              {t('public.signIn')}
            </Link>
          </Section>

          <Section
            id="peserta"
            icon={QrCode}
            title={t('guide.sections.peserta')}
            intro={t('guide.participant.intro')}
            aside={<TableGroupIllustration className="w-full" />}
          >
            <Steps items={list<Item>('guide.participant.steps')} />
            <div
              className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
              aria-label={t('guide.participant.buttons')}
            >
              <p className="flex min-h-20 items-center justify-center gap-2 rounded-2xl bg-success p-3 text-lg font-bold text-white">
                <CircleCheckBig aria-hidden="true" className="size-6" />
                {t('easy.result.PASSED')}
              </p>
              <p className="flex min-h-20 items-center justify-center gap-2 rounded-2xl bg-danger p-3 text-lg font-bold text-white">
                <CircleX aria-hidden="true" className="size-6" />
                {t('easy.result.FAILED')}
              </p>
              <p className="flex min-h-20 items-center justify-center gap-2 rounded-2xl bg-warning p-3 text-lg font-bold text-white">
                <CircleSlash aria-hidden="true" className="size-6" />
                {t('easy.result.BLOCKED')}
              </p>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <li>{t('guide.participant.passed')}</li>
              <li>{t('guide.participant.failed')}</li>
              <li>{t('guide.participant.blocked')}</li>
            </ul>
            <h3 className="mt-8 text-xl font-semibold">{t('guide.faqTitle')}</h3>
            <div className="mt-3">
              <Faq items={list<{ q: string; a: string }>('guide.participant.faq')} />
            </div>
          </Section>

          <Section
            id="penguji"
            icon={FlaskConical}
            title={t('guide.sections.penguji')}
            intro={t('guide.tester.intro')}
          >
            <Steps items={list<Item>('guide.tester.steps')} />
            <Link
              to="/tugas"
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
            >
              <ClipboardCheck aria-hidden="true" className="size-5" />
              {t('nav.myTasks')}
            </Link>
          </Section>

          <Section
            id="admin"
            icon={Presentation}
            title={t('guide.sections.admin')}
            intro={t('guide.admin.intro')}
          >
            {/* Old links to the facilitator part land here. */}
            <span id="fasilitator" className="block scroll-mt-24" />
            <Steps items={list<Item>('guide.admin.steps')} />
            <ul className="mt-6 space-y-2 rounded-2xl bg-pastel-butter p-5 text-pastel-butter-ink">
              {list<string>('guide.admin.tips').map((tip) => (
                <li key={tip} className="flex gap-2">
                  <Sparkles aria-hidden="true" className="mt-1 size-4 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="bug-reporting"
            icon={Bug}
            title={t('guide.sections.bug-reporting')}
            intro={t('guide.bugReporting.intro')}
            aside={<ReportIllustration className="w-full" />}
          >
            {/* Old links to the Developer and Pemantau parts land here. */}
            <span id="developer" className="block scroll-mt-24" />
            <span id="pemantau" className="block scroll-mt-24" />
            <Steps items={list<Item>('guide.bugReporting.steps')} />
          </Section>

          <Section
            id="peran"
            icon={ShieldCheck}
            title={t('guide.sections.peran')}
            intro={t('guide.roles.intro')}
          >
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[36rem] text-left">
                <thead className="bg-brand-50 text-sm text-brand-800">
                  <tr>
                    <th scope="col" className="p-3">
                      {t('guide.roles.head.role')}
                    </th>
                    <th scope="col" className="p-3">
                      {t('guide.roles.head.who')}
                    </th>
                    <th scope="col" className="p-3">
                      {t('guide.roles.head.can')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {list<{ role: string; who: string; can: string }>('guide.roles.rows').map(
                    (row) => (
                      <tr key={row.role} className="align-top">
                        <th scope="row" className="p-3 font-semibold">
                          {row.role}
                        </th>
                        <td className="p-3 text-ink-muted">{row.who}</td>
                        <td className="p-3">{row.can}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            id="publik"
            icon={Globe}
            title={t('guide.sections.publik')}
            intro={t('guide.publish.intro')}
          >
            <Steps items={list<Item>('guide.publish.steps')} />
            <p className="mt-5 rounded-xl bg-success-soft p-4 text-success">
              {t('guide.publish.sees')}
            </p>
          </Section>

          <Section
            id="super-admin"
            icon={UserCog}
            title={t('guide.sections.super-admin')}
            intro={t('guide.superAdmin.intro')}
          >
            <Steps items={list<Item>('guide.superAdmin.steps')} />
          </Section>

          <Section
            id="istilah"
            icon={ListChecks}
            title={t('guide.sections.istilah')}
            intro={t('guide.glossary.intro')}
          >
            <dl className="grid gap-3 md:grid-cols-2">
              {list<{ term: string; original: string; meaning: string }>('guide.glossary.rows').map(
                (row) => (
                  <div key={row.term} className="rounded-2xl border border-line bg-surface p-4">
                    <dt className="font-semibold">
                      {row.term}
                      <span className="ml-2 text-xs font-normal text-ink-muted">
                        ({row.original})
                      </span>
                    </dt>
                    <dd className="mt-1 text-ink-muted">{row.meaning}</dd>
                  </div>
                ),
              )}
            </dl>
          </Section>

          <Section id="privasi" icon={LockKeyhole} title={t('guide.sections.privasi')}>
            <ul className="space-y-2">
              {list<string>('guide.privacy.points').map((point) => (
                <li key={point} className="flex gap-2">
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-teal-700"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-ink-muted">{t('guide.help')}</p>
          </Section>
        </div>
      </div>
    </>
  )
}
