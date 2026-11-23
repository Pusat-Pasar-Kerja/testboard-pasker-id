import type {
  WorkshopBugDto,
  WorkshopCaseDto,
  WorkshopResultInput,
  WorkshopResultSaved,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  CloudOff,
  Grid3x3,
  LoaderCircle,
  RotateCcw,
  ThumbsUp,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { FormAlert } from '../components/ui/Form'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { PhotoPicker } from '../components/workshop/PhotoPicker'
import { usePhotoUploads } from '../components/workshop/use-photo-uploads'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { useTesterName } from '../components/workshop/use-tester-name'
import { useWorkshopBugs, useWorkshopCases } from '../hooks/workshop-queries'
import { useTableSession } from '../layout/table-session'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { isRetryable } from '../lib/outbox'
import { clientId, isAnswered, type EasyResult } from '../lib/workshop'
import { useOutbox } from '../layout/outbox-state'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

const RESULT_STYLE: Record<EasyResult, string> = {
  PASSED: 'bg-success text-white hover:bg-success/90',
  FAILED: 'bg-danger text-white hover:bg-danger/90',
  BLOCKED: 'bg-warning text-white hover:bg-warning/90',
}
const RESULT_ICON = { PASSED: CircleCheckBig, FAILED: CircleX, BLOCKED: CircleSlash } as const
const BLOCK_REASONS = ['PAGE', 'DATA', 'STEPS', 'OTHER'] as const

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function ScenarioBody({ scenario }: { scenario: WorkshopCaseDto }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl leading-snug font-bold sm:text-3xl">{scenario.title}</h1>
        {/* The code is only for organisers who help at the table: small, after the title. */}
        <p className="mt-1 font-mono text-xs text-ink-muted">{scenario.case_code}</p>
        {scenario.actor_label && (
          <p className="mt-2 text-lg text-ink-muted">
            {t('easy.case.actor', { actor: scenario.actor_label })}
          </p>
        )}
      </div>
      {scenario.preconditions && (
        <div>
          <h2 className="text-lg font-semibold">{t('easy.case.preparation')}</h2>
          <p className="mt-1 text-lg whitespace-pre-line">{scenario.preconditions}</p>
        </div>
      )}
      {scenario.steps.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">{t('easy.case.steps')}</h2>
          <ol className="mt-2 space-y-2">
            {scenario.steps.map((step, index) => (
              <li key={index} className="flex gap-3 text-lg">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800">
                  {index + 1}
                </span>
                <span className="pt-0.5 whitespace-pre-line">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {scenario.expected_result && (
        <div className="rounded-2xl border-2 border-success/30 bg-success-soft p-4">
          <h2 className="text-lg font-semibold text-success">{t('easy.case.expected')}</h2>
          <p className="mt-1 text-lg whitespace-pre-line text-ink">{scenario.expected_result}</p>
        </div>
      )}
    </div>
  )
}

function BugSuggestion({
  bug,
  chosen,
  onChoose,
}: {
  bug: WorkshopBugDto
  chosen: boolean
  onChoose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const photo = bug.files.find((f) => f.ready)
  return (
    <li
      className={`flex gap-3 rounded-2xl border-2 p-4 ${chosen ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface'}`}
    >
      {photo && (
        <img
          src={ds.workshopFileUrl(photo.id, 'thumbnail')}
          alt=""
          className="size-20 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">
          {bug.bug_code}
          {bug.table_name ? ` · ${bug.table_name}` : ''}
        </p>
        <p className="text-lg font-semibold break-words">{bug.title}</p>
        {bug.description && <p className="line-clamp-2 text-ink-muted">{bug.description}</p>}
        {bug.confirmations > 0 && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-pastel-peach-ink">
            <ThumbsUp aria-hidden="true" className="size-4" />
            {t('easy.bugs.alsoSeen', { count: bug.confirmations })}
          </p>
        )}
        {!chosen && (
          <button
            type="button"
            onClick={onChoose}
            className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
          >
            <ThumbsUp aria-hidden="true" className="size-5" />
            {t('easy.failed.same')}
          </button>
        )}
      </div>
    </li>
  )
}

/** "Tidak sesuai": what happened, photos, and "sudah ada yang melaporkan?" before sending. */
function FailedForm({
  scenario,
  moduleId,
  sending,
  error,
  onCancel,
  onSend,
}: {
  scenario: WorkshopCaseDto
  moduleId: string
  sending: boolean
  error: unknown
  onCancel: () => void
  onSend: (value: {
    note: string
    sameAs: WorkshopBugDto | null
    evidence: { file_id: string }[]
  }) => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [sameAs, setSameAs] = useState<WorkshopBugDto | null>(null)
  const [noteError, setNoteError] = useState(false)
  const uploads = usePhotoUploads()
  const query = useDebounced(note.trim(), 600)
  const suggestions = useWorkshopBugs(
    { q: query, module: moduleId, run_case: scenario.run_case_id },
    query.length >= 8,
  )
  const known = useWorkshopBugs({ module: moduleId }, scenario.bugs.length > 0)
  const forScenario = (known.data ?? []).filter((b) => scenario.bugs.some((x) => x.id === b.id))
  const typed = (suggestions.data ?? []).filter((b) => !forScenario.some((x) => x.id === b.id))
  const candidates = [...forScenario, ...typed]

  return (
    <div className="space-y-5 rounded-3xl border-2 border-danger/30 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-danger">{t('easy.failed.title')}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold text-ink-muted hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-5" />
          {t('easy.cancel')}
        </button>
      </div>
      <label className="block">
        <span className="block text-lg font-semibold">{t('easy.failed.what')}</span>
        <span className="block text-sm text-ink-muted">{t('easy.failed.whatHint')}</span>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setNoteError(false)
          }}
          rows={4}
          maxLength={5000}
          aria-invalid={noteError || undefined}
          className={`mt-2 block w-full rounded-2xl border-2 bg-surface p-3 text-lg ${noteError ? 'border-danger' : 'border-line-strong'}`}
        />
      </label>
      <PhotoPicker uploads={uploads} />

      {candidates.length > 0 && (
        <div>
          <p className="text-lg font-semibold">{t('easy.failed.maybeSame')}</p>
          <p className="text-sm text-ink-muted">{t('easy.failed.maybeSameHint')}</p>
          <ul className="mt-3 space-y-3">
            {(sameAs ? [sameAs] : candidates.slice(0, 4)).map((bug) => (
              <BugSuggestion
                key={bug.id}
                bug={bug}
                chosen={sameAs?.id === bug.id}
                onChoose={() => setSameAs(bug)}
              />
            ))}
          </ul>
          {sameAs && (
            <button
              type="button"
              onClick={() => setSameAs(null)}
              className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t('easy.failed.notSame')}
            </button>
          )}
        </div>
      )}

      <FormAlert message={error ? apiErrorText(t, error) : null} />
      {uploads.busy && (
        <p className="flex items-center gap-2 text-ink-muted" role="status">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          {t('easy.photo.waiting')}
        </p>
      )}
      <button
        type="button"
        disabled={sending || uploads.busy}
        onClick={() => {
          if (!sameAs && note.trim().length < 3) {
            setNoteError(true)
            return
          }
          onSend({ note: note.trim(), sameAs, evidence: uploads.evidence() })
        }}
        className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-danger px-6 text-xl font-semibold text-white shadow-sm hover:bg-danger/90 disabled:opacity-50"
      >
        {sending && <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />}
        {sameAs ? t('easy.failed.sendSame', { code: sameAs.bug_code }) : t('easy.failed.send')}
      </button>
      {noteError && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {t('easy.failed.noteRequired')}
        </p>
      )}
    </div>
  )
}

function BlockedForm({
  sending,
  error,
  onCancel,
  onSend,
}: {
  sending: boolean
  error: unknown
  onCancel: () => void
  onSend: (note: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<(typeof BLOCK_REASONS)[number] | null>(null)
  const [text, setText] = useState('')
  return (
    <div className="space-y-5 rounded-3xl border-2 border-warning/40 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-warning">{t('easy.blocked.title')}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold text-ink-muted hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-5" />
          {t('easy.cancel')}
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label={t('easy.blocked.why')}
        className="grid gap-2 sm:grid-cols-2"
      >
        {BLOCK_REASONS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={reason === value}
            onClick={() => setReason(value)}
            className={`min-h-14 rounded-xl px-4 text-left text-lg font-semibold ${
              reason === value
                ? 'bg-brand-700 text-white'
                : 'border border-line-strong bg-surface hover:bg-neutral-soft'
            }`}
          >
            {t(`easy.blocked.reason.${value}`)}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="block text-lg font-semibold">{t('easy.blocked.more')}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-2 block w-full rounded-2xl border-2 border-line-strong bg-surface p-3 text-lg"
        />
      </label>
      <FormAlert message={error ? apiErrorText(t, error) : null} />
      <button
        type="button"
        disabled={sending}
        onClick={() =>
          onSend(
            [reason ? t(`easy.blocked.reason.${reason}`) : null, text.trim() || null]
              .filter(Boolean)
              .join(' - '),
          )
        }
        className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-warning px-6 text-xl font-semibold text-white shadow-sm disabled:opacity-50"
      >
        {sending && <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />}
        {t('easy.blocked.send')}
      </button>
    </div>
  )
}

type Mode = 'choose' | 'FAILED' | 'BLOCKED'

/** One scenario: read it, try it, answer it. Keyed by scenario so state starts fresh. */
function ScenarioScreen({
  scenario,
  moduleId,
  onNext,
  hasNext,
}: {
  scenario: WorkshopCaseDto
  moduleId: string
  onNext: () => void
  hasNext: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const session = useTableSession()
  const tester = useTesterName(session.table.id)
  const runOpen = session.run?.status_code === 'ACTIVE'
  const [mode, setMode] = useState<Mode>('choose')
  const outbox = useOutbox()
  const queued = outbox.pending.find((e) => e.run_case_id === scenario.run_case_id)
  /** result null = kept on this device, waiting to be sent. */
  const [saved, setSaved] = useState<{
    status: EasyResult
    result: WorkshopResultSaved | null
  } | null>(null)
  const submission = useRef(clientId())
  const answered = isAnswered(scenario.latest?.status)
  const [changing, setChanging] = useState(false)

  type Answer = {
    status: EasyResult
    note?: string | null
    sameAs?: string | null
    evidence?: { file_id: string }[]
  }
  const toInput = (input: Answer): WorkshopResultInput => ({
    result_status: input.status,
    note: input.note ?? null,
    tester_name: tester.name,
    evidence: input.evidence,
    same_as_defect_id: input.sameAs ?? null,
    client_id: submission.current,
  })
  const save = useMutation({
    mutationFn: (input: Answer) => ds.saveWorkshopResult(scenario.run_case_id, toInput(input)),
    onError: (error, input) => {
      // No connection: keep the answer on this device and send it later (same client id).
      if (!isRetryable(error)) return
      outbox.add({
        client_id: submission.current,
        run_case_id: scenario.run_case_id,
        module_id: moduleId,
        title: `${scenario.case_code} - ${scenario.title}`,
        input: toInput(input),
        queued_at: new Date().toISOString(),
      })
      submission.current = clientId()
      setSaved({ status: input.status, result: null })
      setMode('choose')
      setChanging(false)
      save.reset()
    },
    onSuccess: async (result, input) => {
      submission.current = clientId()
      setSaved({ status: input.status, result })
      setMode('choose')
      setChanging(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop', 'cases', moduleId] }),
        queryClient.invalidateQueries({ queryKey: ['workshop', 'session'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop', 'bugs'] }),
      ])
    },
  })
  const runClosedError =
    save.error instanceof ApiClientError && save.error.details[0]?.message === 'RUN_NOT_ACTIVE'

  const showButtons = runOpen && mode === 'choose' && !saved && (!(answered || queued) || changing)

  return (
    <div className="space-y-6">
      <article className="rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-7">
        <ScenarioBody scenario={scenario} />
      </article>

      {queued && !saved && (
        <p className="flex items-center gap-2 rounded-2xl bg-warning-soft p-4 text-lg text-warning">
          <CloudOff aria-hidden="true" className="size-6 shrink-0" />
          {t('easy.case.queued', { result: t(`easy.result.${queued.input.result_status}`) })}
        </p>
      )}
      {answered && !saved && scenario.latest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-lg">
            <span className="font-semibold">
              {t('easy.case.answered', { result: t(`easy.result.${scenario.latest.status}`) })}
            </span>{' '}
            <span className="text-ink-muted">
              {[scenario.latest.table_name, scenario.latest.tester_name]
                .filter(Boolean)
                .join(' · ')}
              {scenario.latest.at ? ` · ${formatShortDateTime(scenario.latest.at, locale)}` : ''}
            </span>
          </p>
          {runOpen && !changing && (
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-4 font-semibold hover:bg-neutral-soft"
            >
              <RotateCcw aria-hidden="true" className="size-5" />
              {t('easy.case.change')}
            </button>
          )}
        </div>
      )}

      {!runOpen && (
        <p className="rounded-2xl bg-warning-soft p-4 text-lg text-warning">
          {t('easy.home.runClosed')}
        </p>
      )}
      {!tester.name && session.table.member_names.length > 0 && showButtons && (
        <p className="rounded-2xl bg-info-soft p-4 text-info">{t('easy.case.whoHint')}</p>
      )}

      {showButtons && (
        <div className="space-y-3">
          <p className="text-center text-lg font-semibold">{t('easy.case.question')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['PASSED', 'FAILED', 'BLOCKED'] as const).map((status) => {
              const Icon = RESULT_ICON[status]
              return (
                <button
                  key={status}
                  type="button"
                  disabled={save.isPending}
                  onClick={() => (status === 'PASSED' ? save.mutate({ status }) : setMode(status))}
                  className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl px-4 text-xl font-bold shadow-sm disabled:opacity-60 ${RESULT_STYLE[status]}`}
                >
                  {save.isPending && status === 'PASSED' ? (
                    <LoaderCircle aria-hidden="true" className="size-8 animate-spin" />
                  ) : (
                    <Icon aria-hidden="true" className="size-8" />
                  )}
                  {t(`easy.result.${status}`)}
                </button>
              )
            })}
          </div>
          <FormAlert
            message={
              mode === 'choose' && save.isError
                ? runClosedError
                  ? t('easy.home.runClosed')
                  : apiErrorText(t, save.error)
                : null
            }
          />
        </div>
      )}

      {mode === 'FAILED' && (
        <FailedForm
          scenario={scenario}
          moduleId={moduleId}
          sending={save.isPending}
          error={save.error}
          onCancel={() => setMode('choose')}
          onSend={({ note, sameAs, evidence }) =>
            save.mutate({ status: 'FAILED', note: note || null, sameAs: sameAs?.id, evidence })
          }
        />
      )}
      {mode === 'BLOCKED' && (
        <BlockedForm
          sending={save.isPending}
          error={save.error}
          onCancel={() => setMode('choose')}
          onSend={(note) => save.mutate({ status: 'BLOCKED', note: note || null })}
        />
      )}

      {saved && (
        <div
          role="status"
          className={`space-y-4 rounded-3xl p-6 text-center ${saved.result ? 'bg-success-soft' : 'bg-warning-soft'}`}
        >
          {saved.result ? (
            <CircleCheckBig aria-hidden="true" className="mx-auto size-12 text-success" />
          ) : (
            <CloudOff aria-hidden="true" className="mx-auto size-12 text-warning" />
          )}
          <p className="text-2xl font-bold">
            {saved.result ? t('easy.saved.title') : t('easy.saved.queuedTitle')}
          </p>
          <p className="text-lg">
            {!saved.result
              ? t('easy.saved.queued')
              : saved.result.defect
                ? saved.result.defect.created
                  ? t('easy.saved.newBug', { code: saved.result.defect.bug_code })
                  : t('easy.saved.sameBug', { code: saved.result.defect.bug_code })
                : t('easy.saved.answer', { result: t(`easy.result.${saved.status}`) })}
          </p>
          {hasNext ? (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-6 text-xl font-semibold text-white shadow-sm hover:bg-brand-800 sm:w-auto"
            >
              {t('easy.saved.next')}
              <ArrowRight aria-hidden="true" className="size-6" />
            </button>
          ) : (
            <Link
              to="/meja/kerja"
              className="inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-brand-700 px-6 text-xl font-semibold text-white shadow-sm"
            >
              {t('easy.saved.allDone')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ScenarioGrid({
  cases,
  current,
  onPick,
  onClose,
}: {
  cases: WorkshopCaseDto[]
  current: number
  onPick: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const outbox = useOutbox()
  const color = (c: WorkshopCaseDto) =>
    outbox.pending.some((e) => e.run_case_id === c.run_case_id)
      ? 'border-2 border-dashed border-warning bg-warning-soft text-warning'
      : !c.latest
        ? 'border border-line-strong bg-surface text-ink'
        : c.latest.status === 'PASSED'
          ? 'bg-success text-white'
          : c.latest.status === 'FAILED'
            ? 'bg-danger text-white'
            : 'bg-warning text-white'
  return (
    <section
      aria-label={t('easy.grid.title')}
      className="rounded-3xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t('easy.grid.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-5" />
          {t('easy.grid.close')}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{t('easy.grid.legend')}</p>
      <ol className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
        {cases.map((c, index) => (
          <li key={c.run_case_id}>
            <button
              type="button"
              onClick={() => onPick(index)}
              aria-current={index === current ? 'step' : undefined}
              aria-label={t('easy.grid.item', {
                n: index + 1,
                title: c.title,
                result: c.latest ? t(`easy.result.${c.latest.status}`) : t('easy.result.NOT_RUN'),
              })}
              className={`inline-flex size-12 items-center justify-center rounded-xl text-lg font-semibold ${color(c)} ${index === current ? 'ring-4 ring-brand-300' : ''}`}
            >
              {index + 1}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Scenarios of one feature for a table, one at a time (Mode Mudah). */
export function TableFeaturePage() {
  const { t } = useTranslation()
  const { moduleId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const session = useTableSession()
  const feature = session.features.find((f) => f.module.id === moduleId)
  const cases = useWorkshopCases(moduleId)
  const [gridOpen, setGridOpen] = useState(false)

  const list = useMemo(() => cases.data ?? [], [cases.data])
  const requested = Number(params.get('n'))
  const firstOpen = list.findIndex((c) => !c.latest)
  // The scenario on screen is remembered by id, so answering it never jumps to the next open
  // one before the participant has seen "Tersimpan" (the address only changes on purpose).
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const fromAddress = requested >= 1 && requested <= list.length ? requested - 1 : -1
  const fromPin = pinnedId ? list.findIndex((c) => c.run_case_id === pinnedId) : -1
  const index = fromAddress >= 0 ? fromAddress : fromPin >= 0 ? fromPin : Math.max(0, firstOpen)
  const shown = list[index]?.run_case_id ?? null
  if (shown && shown !== pinnedId) setPinnedId(shown)
  const go = (target: number) => {
    setPinnedId(list[target]?.run_case_id ?? null)
    setParams({ n: String(target + 1) })
    setGridOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!feature) return <EmptyState description={t('easy.feature.notYours')} />
  const scenario = list[index]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/meja/kerja"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-lg font-semibold text-brand-700 hover:bg-brand-50"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          {t('easy.feature.back')}
        </Link>
        <button
          type="button"
          onClick={() => setGridOpen((v) => !v)}
          aria-expanded={gridOpen}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 font-semibold hover:bg-neutral-soft"
        >
          <Grid3x3 aria-hidden="true" className="size-5" />
          {t('easy.feature.all')}
        </button>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-lg font-semibold">{feature.module.name}</p>
        {list.length > 0 && (
          <p className="text-ink-muted">
            {t('easy.feature.position', { n: index + 1, total: list.length })}
          </p>
        )}
        <div className="mt-2">
          <ProgressMeter counts={feature.progress} headline={false} />
        </div>
      </div>

      {gridOpen && list.length > 0 && (
        <ScenarioGrid cases={list} current={index} onPick={go} onClose={() => setGridOpen(false)} />
      )}

      {cases.isPending && <LoadingState rows={5} />}
      {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
      {cases.isSuccess && list.length === 0 && <EmptyState description={t('easy.feature.empty')} />}
      {scenario && (
        <>
          <ScenarioScreen
            key={scenario.run_case_id}
            scenario={scenario}
            moduleId={moduleId}
            hasNext={index < list.length - 1}
            onNext={() => {
              const nextOpen = list.findIndex((c, i) => i > index && !c.latest)
              go(nextOpen >= 0 ? nextOpen : Math.min(list.length - 1, index + 1))
            }}
          />
          <nav aria-label={t('easy.feature.nav')} className="flex justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-lg font-semibold hover:bg-neutral-soft disabled:opacity-40"
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
              {t('easy.feature.previous')}
            </button>
            <button
              type="button"
              disabled={index >= list.length - 1}
              onClick={() => go(index + 1)}
              className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 text-lg font-semibold hover:bg-neutral-soft disabled:opacity-40"
            >
              {t('easy.feature.nextPlain')}
              <ArrowRight aria-hidden="true" className="size-5" />
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
