import {
  ArrowRight,
  BookOpen,
  Bug,
  CalendarRange,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  ClipboardList,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Presentation,
  QrCode,
  ShieldCheck,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'

type FlowKey = 'project' | 'cycle' | 'feature' | 'scenario' | 'run' | 'result' | 'bug'
const FLOW: { key: FlowKey; icon: LucideIcon; tone: string }[] = [
  { key: 'project', icon: FolderKanban, tone: 'bg-pastel-lavender text-pastel-lavender-ink' },
  { key: 'cycle', icon: CalendarRange, tone: 'bg-pastel-sky text-pastel-sky-ink' },
  { key: 'feature', icon: LayoutGrid, tone: 'bg-pastel-mint text-pastel-mint-ink' },
  { key: 'scenario', icon: ListChecks, tone: 'bg-pastel-butter text-pastel-butter-ink' },
  { key: 'run', icon: ClipboardList, tone: 'bg-pastel-lavender text-pastel-lavender-ink' },
  { key: 'result', icon: CircleCheckBig, tone: 'bg-pastel-mint text-pastel-mint-ink' },
  { key: 'bug', icon: Bug, tone: 'bg-pastel-peach text-pastel-peach-ink' },
]

const SECTIONS = [
  { id: 'cara-kerja', icon: BookOpen },
  { id: 'peserta', icon: QrCode },
  { id: 'fasilitator', icon: Presentation },
  { id: 'admin', icon: UserCog },
  { id: 'istilah', icon: ListChecks },
  { id: 'privasi', icon: ShieldCheck },
] as const

function Section({
  id,
  icon: Icon,
  title,
  intro,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  intro?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-3xl border border-line bg-surface p-6 shadow-xs sm:p-8"
    >
      <h2 id={`${id}-title`} className="flex items-center gap-3 text-2xl font-bold">
        <Icon aria-hidden="true" className="size-7 text-brand-700" />
        {title}
      </h2>
      {intro && <p className="mt-2 max-w-3xl text-lg text-ink-muted">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
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
        <details key={item.q} className="group rounded-xl border border-line p-4 open:bg-canvas">
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

/** "Panduan": how TestBoard works and step-by-step use for participants, facilitators, admins. */
export function GuidePage() {
  const { t } = useTranslation()
  // Arrays of steps / questions live in the translation files (returnObjects).
  const tx = t as unknown as (key: string, options: { returnObjects: true }) => unknown
  const list = <T,>(key: string) => tx(key, { returnObjects: true }) as T[]

  return (
    <PublicSiteLayout>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
          {t('guide.eyebrow')}
        </p>
        <h1 className="mt-1 text-4xl font-bold">{t('guide.title')}</h1>
        <p className="mt-3 text-lg text-ink-muted">{t('guide.subtitle')}</p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={t('guide.toc')} className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-semibold text-ink-muted">{t('guide.toc')}</p>
          <ul className="space-y-1">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 font-medium hover:bg-neutral-soft"
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
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {FLOW.map((step, index) => (
                <li key={step.key} className="relative rounded-2xl border border-line p-4">
                  <span
                    className={`inline-flex size-11 items-center justify-center rounded-xl ${step.tone}`}
                  >
                    <step.icon aria-hidden="true" className="size-6" />
                  </span>
                  <p className="mt-2 text-sm font-semibold text-ink-muted">
                    {t('public.stepNumber', { n: index + 1 })}
                  </p>
                  <p className="text-lg font-semibold">{t(`guide.flow.${step.key}.title`)}</p>
                  <p className="text-sm text-ink-muted">{t(`guide.flow.${step.key}.menu`)}</p>
                  <p className="mt-1">{t(`guide.flow.${step.key}.body`)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-xl bg-info-soft p-4 text-info">{t('guide.flow.example')}</p>
          </Section>

          <Section
            id="peserta"
            icon={QrCode}
            title={t('guide.sections.peserta')}
            intro={t('guide.participant.intro')}
          >
            <Steps items={list<{ title: string; body: string }>('guide.participant.steps')} />
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
            <Link
              to="/meja"
              className="mt-6 inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand-700 px-6 text-lg font-semibold text-white hover:bg-brand-800"
            >
              <QrCode aria-hidden="true" className="size-6" />
              {t('public.tableSignIn')}
            </Link>
          </Section>

          <Section
            id="fasilitator"
            icon={Presentation}
            title={t('guide.sections.fasilitator')}
            intro={t('guide.facilitator.intro')}
          >
            <h3 className="text-xl font-semibold">{t('guide.facilitator.before')}</h3>
            <div className="mt-3">
              <Steps
                items={list<{ title: string; body: string }>('guide.facilitator.beforeSteps')}
              />
            </div>
            <h3 className="mt-8 text-xl font-semibold">{t('guide.facilitator.during')}</h3>
            <div className="mt-3">
              <Steps
                items={list<{ title: string; body: string }>('guide.facilitator.duringSteps')}
              />
            </div>
            <h3 className="mt-8 text-xl font-semibold">{t('guide.facilitator.after')}</h3>
            <div className="mt-3">
              <Steps
                items={list<{ title: string; body: string }>('guide.facilitator.afterSteps')}
              />
            </div>
            <h3 className="mt-8 text-xl font-semibold">{t('guide.faqTitle')}</h3>
            <div className="mt-3">
              <Faq items={list<{ q: string; a: string }>('guide.facilitator.faq')} />
            </div>
          </Section>

          <Section
            id="admin"
            icon={UserCog}
            title={t('guide.sections.admin')}
            intro={t('guide.admin.intro')}
          >
            <Steps items={list<{ title: string; body: string }>('guide.admin.steps')} />
            <h3 className="mt-8 text-xl font-semibold">{t('guide.admin.roles')}</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-line">
                    <th className="p-3">{t('guide.admin.role')}</th>
                    <th className="p-3">{t('guide.admin.can')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list<{ role: string; can: string }>('guide.admin.roleRows').map((row) => (
                    <tr key={row.role} className="border-b border-line align-top">
                      <th scope="row" className="p-3 font-semibold">
                        {row.role}
                      </th>
                      <td className="p-3">{row.can}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            id="istilah"
            icon={ListChecks}
            title={t('guide.sections.istilah')}
            intro={t('guide.glossary.intro')}
          >
            <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {list<{ term: string; plain: string }>('guide.glossary.items').map((item) => (
                <div key={item.term} className="rounded-xl border border-line p-4">
                  <dt className="text-lg font-semibold">{item.term}</dt>
                  <dd className="mt-1 text-ink">{item.plain}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="privasi" icon={ShieldCheck} title={t('guide.sections.privasi')}>
            <ul className="list-disc space-y-2 pl-6 text-lg">
              {list<string>('guide.privacy.points').map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Section>

          <p className="flex flex-wrap items-center gap-2 text-ink-muted">
            <UsersRound aria-hidden="true" className="size-5" />
            {t('guide.help')}
            <Link
              to="/publik"
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
            >
              {t('guide.backHome')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </p>
        </div>
      </div>
    </PublicSiteLayout>
  )
}
