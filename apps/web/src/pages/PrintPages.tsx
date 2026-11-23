import type { WorkshopTableDto } from '@testboard/shared'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { ErrorState, LoadingState } from '../components/ui/States'
import { QrCode } from '../components/workshop/QrCode'
import { useWorkshopTables } from '../hooks/workshop-queries'
import { formatDateTime, toLocale } from '../lib/format'
import { cardUrl, joinAddress, spacedCode } from '../lib/workshop'
import { useDataSource } from '../services/use-data-source'

function PrintButton() {
  const { t } = useTranslation()
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-ink-muted">{t('workshop.print.hint')}</p>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
      >
        <Printer aria-hidden="true" className="size-5" />
        {t('workshop.print.print')}
      </button>
    </div>
  )
}

/** One half of an A4 page: cut along the dashed line, fold or put in a stand. */
function TableCard({ table }: { table: WorkshopTableDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  return (
    <article className="flex h-[136mm] break-inside-avoid flex-col overflow-hidden rounded-2xl border-2 border-ink/80 bg-white text-[#111827] print:rounded-none print:border-b-2 print:border-dashed">
      <header className="flex items-center justify-between gap-4 bg-brand-800 px-6 py-3 text-white">
        <p className="text-sm font-semibold tracking-widest uppercase">
          {t('workshop.print.cardTitle')}
        </p>
        <p className="text-sm">{table.cycle.title}</p>
      </header>
      <div className="flex flex-1 gap-6 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-5xl leading-none font-extrabold">{table.name}</h2>
          <p className="mt-3 text-sm font-semibold text-[#4b5563] uppercase">
            {t('workshop.print.features')}
          </p>
          <p className="text-lg leading-snug font-semibold">
            {table.modules.map((m) => m.name).join(', ') || '-'}
          </p>
          {table.member_names.length > 0 && (
            <>
              <p className="mt-2 text-sm font-semibold text-[#4b5563] uppercase">
                {t('workshop.print.members')}
              </p>
              <p className="text-base">{table.member_names.join(', ')}</p>
            </>
          )}
          <ol className="mt-auto space-y-1 text-[15px] leading-snug">
            <li>
              <strong>1.</strong> {t('workshop.print.step1')}
            </li>
            <li>
              <strong>2.</strong> {t('workshop.print.step2', { address: joinAddress() })}
            </li>
            <li>
              <strong>3.</strong> {t('workshop.print.step3')}
            </li>
          </ol>
        </div>
        <div className="flex w-[64mm] shrink-0 flex-col items-center justify-center gap-2 text-center">
          <QrCode
            value={cardUrl(table.access_code)}
            size={210}
            label={t('workshop.print.qrLabel', { name: table.name })}
          />
          <p className="text-sm text-[#4b5563]">{t('workshop.print.orType')}</p>
          <p className="font-mono text-4xl font-extrabold tracking-[0.2em]">
            {spacedCode(table.access_code)}
          </p>
          <p className="text-xs text-[#4b5563]">
            {t('workshop.print.validUntil', { date: formatDateTime(table.valid_until, locale) })}
          </p>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-2">
        <TestBoardLogo size="sm" />
        <p className="text-xs text-[#4b5563]">{t('workshop.print.keepSafe')}</p>
      </footer>
    </article>
  )
}

/** Printable table cards (2 per A4 page), all tables or one (?meja=<id>). */
export function PrintCardsPage() {
  const { t } = useTranslation()
  const { projectCode = '', cycleId = '' } = useParams()
  const [params] = useSearchParams()
  const only = params.get('meja')
  const tables = useWorkshopTables(projectCode, cycleId)
  if (tables.isPending)
    return (
      <div className="p-8">
        <LoadingState rows={4} />
      </div>
    )
  if (tables.isError)
    return (
      <div className="p-8">
        <ErrorState error={tables.error} />
      </div>
    )
  const list = tables.data.filter((x) => (only ? x.id === only : x.state !== 'REVOKED'))
  return (
    <div className="mx-auto max-w-[210mm] bg-canvas p-6 print:max-w-none print:bg-white print:p-0">
      <PrintButton />
      <h1 className="sr-only">{t('workshop.print.cardsTitle')}</h1>
      <div className="space-y-6 print:space-y-0">
        {list.map((table) => (
          <TableCard key={table.id} table={table} />
        ))}
      </div>
    </div>
  )
}

/** Paper backup for a table: every scenario with boxes to tick and lines for notes. */
export function PrintSheetPage() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const { projectCode = '', cycleId = '', tableId = '' } = useParams()
  const sheet = useQuery({
    queryKey: ['workshop-sheet', projectCode, cycleId, tableId],
    queryFn: () => ds.getWorkshopSheet(projectCode, cycleId, tableId),
  })
  if (sheet.isPending)
    return (
      <div className="p-8">
        <LoadingState rows={6} />
      </div>
    )
  if (sheet.isError)
    return (
      <div className="p-8">
        <ErrorState error={sheet.error} />
      </div>
    )
  const { table, features } = sheet.data
  const offsets = features.map((_, i) =>
    features.slice(0, i).reduce((sum, feature) => sum + feature.cases.length, 0),
  )
  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-[#111827] print:p-0">
      <PrintButton />
      <header className="border-b-2 border-[#111827] pb-3">
        <p className="text-sm font-semibold tracking-widest uppercase">
          {t('workshop.print.sheetTitle')}
        </p>
        <h1 className="text-3xl font-extrabold">
          {table.name} · {table.cycle.title}
        </h1>
        <p className="mt-1">{t('workshop.print.sheetIntro')}</p>
        <p className="mt-2 text-sm">
          {t('workshop.print.filledBy')} ______________________ {t('workshop.print.date')}{' '}
          ______________
        </p>
      </header>
      {features.map(({ module, cases }, featureIndex) => (
        <section key={module.id} className="mt-6">
          <h2 className="text-xl font-bold">{module.name}</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f3f4f6]">
                <th className="w-10 border border-[#9ca3af] p-2 text-left">
                  {t('workshop.print.no')}
                </th>
                <th className="border border-[#9ca3af] p-2 text-left">
                  {t('workshop.print.scenario')}
                </th>
                <th className="w-40 border border-[#9ca3af] p-2 text-left">
                  {t('workshop.print.result')}
                </th>
                <th className="w-48 border border-[#9ca3af] p-2 text-left">
                  {t('workshop.print.note')}
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c, caseIndex) => {
                const number = (offsets[featureIndex] ?? 0) + caseIndex + 1
                return (
                  <tr key={c.run_case_id} className="break-inside-avoid align-top">
                    <td className="border border-[#9ca3af] p-2">{number}</td>
                    <td className="border border-[#9ca3af] p-2">
                      <p className="font-mono text-xs">{c.case_code}</p>
                      <p className="font-semibold">{c.title}</p>
                      {c.steps.length > 0 && (
                        <ol className="mt-1 list-decimal pl-5">
                          {c.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      )}
                      {c.expected_result && (
                        <p className="mt-1">
                          <strong>{t('easy.case.expected')}:</strong> {c.expected_result}
                        </p>
                      )}
                    </td>
                    <td className="border border-[#9ca3af] p-2 leading-loose">
                      ☐ {t('easy.result.PASSED')}
                      <br />☐ {t('easy.result.FAILED')}
                      <br />☐ {t('easy.result.BLOCKED')}
                    </td>
                    <td className="border border-[#9ca3af] p-2" />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
