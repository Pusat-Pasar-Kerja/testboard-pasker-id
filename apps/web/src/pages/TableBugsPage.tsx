import type { WorkshopBugDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, LoaderCircle, Plus, Search, ThumbsUp, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { DefectStatusBadge } from '../components/status/StatusBadges'
import { FormAlert } from '../components/ui/Form'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { PhotoPicker } from '../components/workshop/PhotoPicker'
import { usePhotoUploads } from '../components/workshop/use-photo-uploads'
import { useTesterName } from '../components/workshop/use-tester-name'
import { useWorkshopBugs } from '../hooks/workshop-queries'
import { useTableSession } from '../layout/table-session'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { clientId } from '../lib/workshop'
import { useDataSource } from '../services/use-data-source'

function BugItem({ bug }: { bug: WorkshopBugDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const session = useTableSession()
  const tester = useTesterName(session.table.id)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const uploads = usePhotoUploads()
  const confirm = useMutation({
    mutationFn: () =>
      ds.confirmWorkshopBug(bug.id, {
        note: note.trim() || null,
        tester_name: tester.name,
        evidence: uploads.evidence(),
      }),
    onSuccess: async () => {
      setOpen(false)
      setNote('')
      uploads.clear()
      await queryClient.invalidateQueries({ queryKey: ['workshop', 'bugs'] })
    },
  })
  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className="font-mono">{bug.bug_code}</span>
        <DefectStatusBadge status={bug.status_code} />
        {bug.module && <span>· {bug.module.name}</span>}
      </div>
      <h3 className="mt-2 text-xl leading-snug font-semibold break-words">{bug.title}</h3>
      {bug.description && (
        <p className="mt-1 text-lg whitespace-pre-line break-words">{bug.description}</p>
      )}
      <p className="mt-2 text-sm text-ink-muted">
        {[bug.table_name, bug.tester_name].filter(Boolean).join(' · ')}
        {bug.reported_at ? ` · ${formatShortDateTime(bug.reported_at, locale)}` : ''}
      </p>
      {bug.files.some((f) => f.ready) && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {bug.files
            .filter((f) => f.ready)
            .map((file) => (
              <li key={file.id}>
                <a
                  href={ds.workshopFileUrl(file.id, 'preview')}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-line"
                >
                  <img
                    src={ds.workshopFileUrl(file.id, 'thumbnail')}
                    alt={t('easy.bugs.photo', { name: file.original_filename })}
                    className="size-24 object-cover"
                    loading="lazy"
                  />
                </a>
              </li>
            ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {bug.confirmations > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-pastel-peach-ink">
            <ThumbsUp aria-hidden="true" className="size-5" />
            {t('easy.bugs.alsoSeen', { count: bug.confirmations })}
          </span>
        )}
        {bug.confirmed_by_me ? (
          <span className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-success-soft px-4 font-semibold text-success">
            <Check aria-hidden="true" className="size-5" />
            {t('easy.bugs.mine')}
          </span>
        ) : (
          !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
            >
              <ThumbsUp aria-hidden="true" className="size-5" />
              {t('easy.bugs.metoo')}
            </button>
          )
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-4 rounded-2xl border-2 border-brand-200 p-4">
          <label className="block">
            <span className="block text-lg font-semibold">{t('easy.bugs.metooNote')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-2 block w-full rounded-2xl border-2 border-line-strong bg-surface p-3 text-lg"
            />
          </label>
          <PhotoPicker uploads={uploads} />
          <FormAlert message={confirm.isError ? apiErrorText(t, confirm.error) : null} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={confirm.isPending || uploads.busy}
              onClick={() => confirm.mutate()}
              className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand-700 px-5 text-lg font-semibold text-white disabled:opacity-50"
            >
              {confirm.isPending && (
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
              )}
              {t('easy.bugs.metooSend')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong px-5 text-lg font-semibold"
            >
              <X aria-hidden="true" className="size-5" />
              {t('easy.cancel')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/** A problem not tied to one scenario ("Laporkan masalah lain"). */
function NewBugForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const session = useTableSession()
  const tester = useTesterName(session.table.id)
  const [moduleId, setModuleId] = useState<string | null>(
    session.features.length === 1 ? (session.features[0]?.module.id ?? null) : null,
  )
  const [note, setNote] = useState('')
  const [submission] = useState(clientId)
  const uploads = usePhotoUploads()
  const report = useMutation({
    mutationFn: () =>
      ds.reportWorkshopBug({
        module_id: moduleId,
        note: note.trim(),
        tester_name: tester.name,
        evidence: uploads.evidence(),
        client_id: submission,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workshop'] })
      onDone()
    },
  })
  return (
    <section className="space-y-5 rounded-3xl border-2 border-danger/30 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold">{t('easy.bugs.newTitle')}</h2>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold text-ink-muted hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-5" />
          {t('easy.cancel')}
        </button>
      </div>
      {session.features.length > 1 && (
        <div role="radiogroup" aria-label={t('easy.bugs.whichFeature')} className="space-y-2">
          <p className="text-lg font-semibold">{t('easy.bugs.whichFeature')}</p>
          <div className="flex flex-wrap gap-2">
            {session.features.map((f) => (
              <button
                key={f.module.id}
                type="button"
                role="radio"
                aria-checked={moduleId === f.module.id}
                onClick={() => setModuleId(f.module.id)}
                className={`min-h-12 rounded-xl px-4 text-lg font-semibold ${
                  moduleId === f.module.id
                    ? 'bg-brand-700 text-white'
                    : 'border border-line-strong bg-surface hover:bg-neutral-soft'
                }`}
              >
                {f.module.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="block">
        <span className="block text-lg font-semibold">{t('easy.failed.what')}</span>
        <span className="block text-sm text-ink-muted">{t('easy.failed.whatHint')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={5000}
          className="mt-2 block w-full rounded-2xl border-2 border-line-strong bg-surface p-3 text-lg"
        />
      </label>
      <PhotoPicker uploads={uploads} />
      <FormAlert message={report.isError ? apiErrorText(t, report.error) : null} />
      <button
        type="button"
        disabled={note.trim().length < 3 || report.isPending || uploads.busy}
        onClick={() => report.mutate()}
        className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-danger px-6 text-xl font-semibold text-white disabled:opacity-50"
      >
        {report.isPending && <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />}
        {t('easy.failed.send')}
      </button>
    </section>
  )
}

/** Problems found in this Fase by every table: read, "+1", or report a new one. */
export function TableBugsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const session = useTableSession()
  const [q, setQ] = useState('')
  const [module, setModule] = useState('')
  const creating = params.get('baru') === '1'
  const bugs = useWorkshopBugs({ module: module || undefined })
  const needle = q.trim().toLowerCase()
  const list = (bugs.data ?? []).filter(
    (b) =>
      !needle || `${b.bug_code} ${b.title} ${b.description ?? ''}`.toLowerCase().includes(needle),
  )

  return (
    <div className="space-y-5">
      <Link
        to="/meja/kerja"
        className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-lg font-semibold text-brand-700 hover:bg-brand-50"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        {t('easy.feature.back')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t('easy.bugs.title')}</h1>
          <p className="text-lg text-ink-muted">{t('easy.bugs.subtitle')}</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setParams({ baru: '1' })}
            className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-danger px-5 text-lg font-semibold text-white"
          >
            <Plus aria-hidden="true" className="size-6" />
            {t('easy.home.reportOther')}
          </button>
        )}
      </div>
      {creating && <NewBugForm onDone={() => setParams({})} />}

      <div className="flex flex-wrap gap-3">
        <label className="block min-w-60 flex-1">
          <span className="sr-only">{t('easy.bugs.search')}</span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('easy.bugs.search')}
              className="min-h-14 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-lg"
            />
          </span>
        </label>
        {session.features.length > 1 && (
          <label className="block">
            <span className="sr-only">{t('easy.bugs.whichFeature')}</span>
            <select
              value={module}
              onChange={(e) => setModule(e.target.value)}
              className="min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-lg"
            >
              <option value="">{t('easy.bugs.allFeatures')}</option>
              {session.features.map((f) => (
                <option key={f.module.id} value={f.module.id}>
                  {f.module.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {bugs.isPending && <LoadingState rows={4} />}
      {bugs.isError && <ErrorState error={bugs.error} onRetry={() => void bugs.refetch()} />}
      {bugs.isSuccess && list.length === 0 && <EmptyState description={t('easy.bugs.empty')} />}
      {list.length > 0 && (
        <ul className="space-y-4">
          {list.map((bug) => (
            <BugItem key={bug.id} bug={bug} />
          ))}
        </ul>
      )}
    </div>
  )
}
