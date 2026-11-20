import {
  executionCreateSchema,
  type ExecutionDto,
  type RecordableResult,
  type RunCaseDetail,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  ImageUp,
  Info,
  ListChecks,
  Save,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import {
  ResultPicker,
  StepResultPicker,
  type StepResult,
} from '../components/execution/ResultPicker'
import {
  DefectStatusBadge,
  ExecutionStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextArea, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { invalidateRunData, useCurrentUser, useRunCase } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { useMediaQuery } from '../hooks/use-media-query'
import { apiErrorText, apiFieldErrors } from '../lib/api-errors'
import { formatDateTime, toLocale } from '../lib/format'
import { newIdempotencyKey } from '../lib/idempotency'
import { ApiClientError } from '../services/api-client'
import type { ExecutionInput } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

type StepState = Record<number, { status: StepResult; actual: string }>
type FieldErrors = Partial<Record<'result_status' | 'actual_result' | 'notes', string>>

function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const cls =
    tone === 'warning'
      ? 'border-warning/25 bg-warning-soft text-warning'
      : 'border-info/20 bg-info-soft text-info'
  const Icon = tone === 'warning' ? CircleAlert : Info
  return (
    <p className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${cls}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function AttemptCard({
  attempt,
  highlight = false,
}: {
  attempt: ExecutionDto
  highlight?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const env = [attempt.browser_name, attempt.device_name, attempt.operating_system]
    .filter(Boolean)
    .join(' · ')
  const failedSteps = attempt.step_results.filter((s) => s.result_status !== 'PASSED')
  return (
    <article
      className={`rounded-lg border p-3 text-sm ${highlight ? 'border-brand-200 bg-brand-50/60' : 'border-line'}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{t('fields.attempt', { n: attempt.attempt_number })}</h3>
        <Badge tone="muted" label={t(`codes.executionKind.${attempt.execution_kind}`)} />
        <ExecutionStatusBadge status={attempt.result_status} />
      </header>
      <p className="mt-1 text-xs text-ink-muted">
        {attempt.tester?.display_name ?? attempt.legacy_tester_name ?? t('fields.none')}
        {attempt.tested_at && <> · {formatDateTime(attempt.tested_at, locale)}</>}
        {env && <> · {env}</>}
      </p>
      {attempt.actual_result && (
        <p className="mt-2 whitespace-pre-line">
          <span className="font-medium">{t('fields.actualResult')}: </span>
          {attempt.actual_result}
        </p>
      )}
      {attempt.notes && (
        <p className="mt-1 whitespace-pre-line text-ink-muted">
          <span className="font-medium text-ink">{t('fields.notes')}: </span>
          {attempt.notes}
        </p>
      )}
      {attempt.step_results.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-ink-muted">
            {t('pages.execution.stepResults')}:{' '}
            {t('pages.execution.stepsPassed', {
              passed: attempt.step_results.length - failedSteps.length,
              total: attempt.step_results.length,
            })}
          </p>
          {failedSteps.length > 0 && (
            <ul className="mt-1 space-y-1">
              {failedSteps.map((step) => (
                <li key={step.step_number} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">
                    {t('pages.execution.stepLabel', { n: step.step_number })}
                  </span>
                  <ExecutionStatusBadge status={step.result_status} />
                  {step.actual_result && <span>{step.actual_result}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

function Workspace({ detail }: { detail: RunCaseDetail }) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const can = useCan(code)
  const me = useCurrentUser()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const snap = detail.snapshot
  const last = detail.attempts[0] ?? null
  const runPath = projectPath(code, `runs/${detail.run.id}`)
  const casePath = (id: string) => `${runPath}/cases/${id}`

  const [result, setResult] = useState<RecordableResult | ''>('')
  const [actual, setActual] = useState('')
  const [notes, setNotes] = useState('')
  const [kind, setKind] = useState<'RETEST' | 'RERUN'>('RETEST')
  const [env, setEnv] = useState({
    browser_name: last?.browser_name ?? '',
    device_name: last?.device_name ?? '',
    operating_system: last?.operating_system ?? '',
  })
  const [steps, setSteps] = useState<StepState>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [tab, setTab] = useState('scenario')
  const idempotencyKey = useRef(newIdempotencyKey())
  const allowLeave = useRef(false)

  // Who may record here (doc 09 + ADR 0006). The API enforces the same rules.
  const isLead = can('run.write')
  const blockedReason: string | null = !can('execution.run')
    ? t('pages.execution.readOnly')
    : detail.run.status_code !== 'ACTIVE'
      ? t(`pages.execution.locked.${detail.run.status_code}`)
      : !isLead && detail.assigned_to?.id !== me.data?.id
        ? detail.assigned_to
          ? t('pages.execution.notAssigned', { name: detail.assigned_to.display_name })
          : t('pages.execution.notAssignedNobody')
        : null
  const canRecord = blockedReason === null

  const marked = Object.values(steps).filter((s) => s.status !== 'NOT_RUN').length
  const dirty = Boolean(result || actual.trim() || notes.trim() || marked > 0)
  const blocker = useBlocker(() => dirty && !allowLeave.current)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setStep = (n: number, patch: Partial<StepState[number]>) =>
    setSteps((prev) => ({
      ...prev,
      [n]: { status: prev[n]?.status ?? 'NOT_RUN', actual: prev[n]?.actual ?? '', ...patch },
    }))

  const save = useMutation({
    mutationFn: ({ input }: { input: ExecutionInput; next: boolean }) =>
      ds.createExecution(code, detail.run_case_id, input, idempotencyKey.current),
    onSuccess: async (attempt, { next }) => {
      allowLeave.current = true
      await invalidateRunData(queryClient, code, detail.run.id)
      toast.show(
        t('pages.execution.saved', {
          n: attempt.attempt_number,
          status: t(`codes.execution.${attempt.result_status}`),
        }),
      )
      if (next && detail.next_run_case_id) {
        navigate(casePath(detail.next_run_case_id))
        return
      }
      // Stay for another look: clear the result, keep the environment for the next attempt.
      idempotencyKey.current = newIdempotencyKey()
      setResult('')
      setActual('')
      setNotes('')
      setSteps({})
      setTab('history')
      allowLeave.current = false
    },
    onError: async (error) => {
      const fields = apiFieldErrors(error)
      setErrors({
        actual_result: fields.actual_result ? t('form.required') : undefined,
        notes: fields.notes ? t('form.required') : undefined,
      })
      setFormError(
        error instanceof ApiClientError && error.status === 422
          ? t('form.invalid')
          : t('pages.execution.conflict', { message: apiErrorText(t, error) }),
      )
      // The run may have been completed or the case reassigned meanwhile.
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 403)) {
        await queryClient.invalidateQueries({ queryKey: ['run-case', code, detail.run_case_id] })
      }
    },
  })

  function submit(next: boolean) {
    setFormError(null)
    const stepResults = snap.steps.flatMap((s) => {
      const state = steps[s.step_number]
      return state && state.status !== 'NOT_RUN'
        ? [
            {
              step_number: s.step_number,
              result_status: state.status,
              actual_result: state.actual.trim() || null,
            },
          ]
        : []
    })
    const input: ExecutionInput = {
      result_status: result as RecordableResult,
      actual_result: actual.trim() || null,
      notes: notes.trim() || null,
      ...(detail.attempts.length > 0 ? { execution_kind: kind } : {}),
      browser_name: env.browser_name.trim() || null,
      device_name: env.device_name.trim() || null,
      operating_system: env.operating_system.trim() || null,
      ...(stepResults.length > 0 ? { step_results: stepResults } : {}),
    }
    const parsed = executionCreateSchema.safeParse(input)
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '')
        if (key === 'result_status') next.result_status = t('pages.execution.chooseResult')
        if (key === 'actual_result') next.actual_result = t('form.required')
        if (key === 'notes') next.notes = t('form.required')
      }
      setErrors(next)
      setFormError(t('form.invalid'))
      if (!desktop) setTab('result')
      return
    }
    save.mutate({ input, next })
  }

  const savingNext = save.isPending && save.variables.next
  const needsReason = result === 'BLOCKED' || result === 'SKIPPED'

  const scenario = (
    <Section
      title={snap.title}
      description={[
        snap.module_code,
        snap.category,
        t(`codes.casePriority.${snap.priority_code}`),
        t(`codes.testType.${snap.test_type_code}`),
        snap.actor_label,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="space-y-5 text-sm">
        {snap.preconditions && (
          <div>
            <h3 className="mb-1 font-semibold">{t('fields.preconditions')}</h3>
            <p className="whitespace-pre-line text-ink-muted">{snap.preconditions}</p>
          </div>
        )}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t('fields.steps')}</h3>
            {canRecord && snap.steps.length > 0 && (
              <span className="flex items-center gap-2">
                <span className="text-xs text-ink-muted tabular-nums">
                  {t('pages.execution.stepsMarked', { done: marked, total: snap.steps.length })}
                </span>
                <Button
                  variant="ghost"
                  icon={ListChecks}
                  onClick={() =>
                    setSteps(
                      Object.fromEntries(
                        snap.steps.map((s) => [
                          s.step_number,
                          { status: 'PASSED', actual: steps[s.step_number]?.actual ?? '' },
                        ]),
                      ),
                    )
                  }
                >
                  {t('pages.execution.markAllPassed')}
                </Button>
              </span>
            )}
          </div>
          {snap.steps.length === 0 ? (
            <>
              {snap.test_steps_text && (
                <p className="whitespace-pre-line">{snap.test_steps_text}</p>
              )}
              <p className="mt-1 text-xs text-ink-muted">{t('pages.execution.noSteps')}</p>
            </>
          ) : (
            <ol className="space-y-2">
              {snap.steps.map((step) => {
                const state = steps[step.step_number]
                return (
                  <li key={step.step_number} className="rounded-lg border border-line p-3">
                    <div className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
                      >
                        {step.step_number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words">
                          <span className="sr-only">
                            {t('pages.execution.stepLabel', { n: step.step_number })}:{' '}
                          </span>
                          {step.instruction}
                        </p>
                        {step.expected_result && (
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {t('pages.execution.stepExpected')} {step.expected_result}
                          </p>
                        )}
                        {canRecord && (
                          <StepResultPicker
                            stepNumber={step.step_number}
                            value={state?.status ?? 'NOT_RUN'}
                            onChange={(status) => setStep(step.step_number, { status })}
                          />
                        )}
                        {canRecord && state?.status === 'FAILED' && (
                          <TextArea
                            className="mt-2"
                            label={t('pages.execution.stepActual', { n: step.step_number })}
                            rows={2}
                            value={state.actual}
                            onChange={(e) => setStep(step.step_number, { actual: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        <div>
          <h3 className="mb-1 font-semibold">{t('fields.expectedResult')}</h3>
          <p className="whitespace-pre-line">{snap.expected_result ?? t('fields.none')}</p>
        </div>
      </div>
    </Section>
  )

  const record = (
    <Section title={t('pages.execution.resultHeading')}>
      {!canRecord ? (
        <Notice>{blockedReason}</Notice>
      ) : (
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            submit(false)
          }}
        >
          {last && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {t('pages.execution.previous')}
              </p>
              <AttemptCard attempt={last} highlight />
            </div>
          )}
          <ResultPicker
            value={result}
            onChange={(value) => {
              setResult(value)
              setErrors({})
            }}
            error={errors.result_status}
          />
          <TextArea
            label={t('fields.actualResult')}
            required={result === 'FAILED'}
            value={actual}
            onChange={(e) => {
              setActual(e.target.value)
              setErrors((x) => ({ ...x, actual_result: undefined }))
            }}
            hint={t('pages.execution.actualHint')}
            error={errors.actual_result}
            rows={3}
          />
          <TextArea
            label={needsReason ? t('fields.reason') : t('fields.notes')}
            required={needsReason}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setErrors((x) => ({ ...x, notes: undefined }))
            }}
            hint={t('pages.execution.reasonHint')}
            error={errors.notes}
            rows={2}
          />
          {detail.attempts.length > 0 && (
            <SelectField
              label={t('fields.executionKind')}
              required
              value={kind}
              onChange={(e) => setKind(e.target.value as 'RETEST' | 'RERUN')}
              options={(['RETEST', 'RERUN'] as const).map((k) => ({
                value: k,
                label: t(`codes.executionKind.${k}`),
              }))}
            />
          )}
          <details className="group rounded-lg border border-line">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-medium">
              {t('pages.execution.envHeading')}
              <span className="truncate text-xs font-normal text-ink-muted">
                {[env.browser_name, env.device_name, env.operating_system]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-line p-3 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
              <TextField
                label={t('fields.browser')}
                value={env.browser_name}
                onChange={(e) => setEnv((x) => ({ ...x, browser_name: e.target.value }))}
                placeholder="Chrome 131"
              />
              <TextField
                label={t('fields.device')}
                value={env.device_name}
                onChange={(e) => setEnv((x) => ({ ...x, device_name: e.target.value }))}
                placeholder="Laptop"
              />
              <TextField
                label={t('fields.os')}
                value={env.operating_system}
                onChange={(e) => setEnv((x) => ({ ...x, operating_system: e.target.value }))}
                placeholder="Windows 11"
              />
            </div>
          </details>
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <ImageUp aria-hidden="true" className="size-4 shrink-0" />
            {t('pages.execution.evidenceSoon')}
          </p>
          <p className="text-xs text-ink-muted">
            {t('pages.execution.attemptNext', { n: (last?.attempt_number ?? 0) + 1 })}
          </p>
          <FormAlert message={formError} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="submit"
              icon={Save}
              variant={detail.next_run_case_id ? 'secondary' : 'primary'}
              loading={save.isPending && !savingNext}
              disabled={save.isPending}
            >
              {t('pages.execution.save')}
            </Button>
            {detail.next_run_case_id && (
              <Button
                icon={ArrowRight}
                loading={savingNext}
                disabled={save.isPending}
                onClick={() => submit(true)}
              >
                {t('pages.execution.saveNext')}
              </Button>
            )}
          </div>
        </form>
      )}
    </Section>
  )

  const history = (
    <Section title={t('pages.execution.historyHeading')}>
      {detail.attempts.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('pages.execution.historyEmpty')}</p>
      ) : (
        <ol className="space-y-3">
          {detail.attempts.map((attempt) => (
            <li key={attempt.id}>
              <AttemptCard attempt={attempt} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  )

  const bugs = (
    <Section title={t('pages.execution.bugsHeading')}>
      {detail.linked_defects.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('pages.execution.bugsEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {detail.linked_defects.map((bug) => (
            <li key={bug.id}>
              <Link
                to={projectPath(code, `bugs/${bug.id}`)}
                className="block rounded-lg border border-line p-3 text-sm hover:border-brand-200 hover:shadow-sm"
              >
                <span className="text-xs font-semibold text-brand-700">{bug.bug_code}</span>
                <span className="block font-medium break-words">{bug.title}</span>
                <span className="mt-1 flex flex-wrap gap-2">
                  <DefectStatusBadge status={bug.status_code} />
                  <SeverityBadge severity={bug.severity_code} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">{t('pages.execution.bugsSoon')}</p>
    </Section>
  )

  return (
    <>
      <PageHeader
        title={snap.title}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.runs.title'), to: projectPath(code, 'runs') },
          { label: detail.run.run_code, to: runPath },
          { label: snap.case_code },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{snap.case_code}</span>
            <ExecutionStatusBadge status={detail.latest_status} />
            <Badge
              tone="muted"
              label={t('pages.execution.snapshotVersion', { version: detail.case_version })}
            />
          </>
        }
        subtitle={[
          detail.run.name,
          detail.run.environment_name,
          detail.run.build_version && `${t('fields.build')} ${detail.run.build_version}`,
          `${t('fields.assignee')}: ${detail.assigned_to?.display_name ?? t('pages.runDetail.unassigned')}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {detail.run.environment_url && (
              <a
                href={detail.run.environment_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('pages.execution.openEnvironment')}
              </a>
            )}
            {detail.previous_run_case_id && (
              <ButtonLink
                to={casePath(detail.previous_run_case_id)}
                variant="secondary"
                icon={ChevronLeft}
              >
                <span className="sr-only sm:not-sr-only">{t('pages.execution.prev')}</span>
              </ButtonLink>
            )}
            {detail.next_run_case_id && (
              <ButtonLink
                to={casePath(detail.next_run_case_id)}
                variant="secondary"
                icon={ChevronRight}
              >
                <span className="sr-only sm:not-sr-only">{t('pages.execution.next')}</span>
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {detail.current_case_version > detail.case_version && (
          <Notice tone="warning">
            {t('pages.execution.newerVersion', {
              current: detail.current_case_version,
              version: detail.case_version,
            })}
          </Notice>
        )}

        {desktop ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              {scenario}
              {history}
            </div>
            <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              {record}
              {bugs}
            </div>
          </div>
        ) : (
          <Tabs
            label={snap.case_code}
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'scenario', label: t('pages.execution.scenarioTab'), content: scenario },
              { id: 'result', label: t('pages.execution.resultTab'), content: record },
              {
                id: 'history',
                label: t('pages.execution.historyTab'),
                count: detail.attempts.length,
                content: (
                  <div className="space-y-6">
                    {history}
                    {bugs}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('form.unsavedTitle')}
        body={t('form.unsavedBody')}
        confirmLabel={t('form.leave')}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </>
  )
}

export function ExecutionPage() {
  const code = useProjectCode()
  const { runId = '', runCaseId = '' } = useParams()
  const detail = useRunCase(code, runCaseId)

  if (detail.isPending) return <LoadingState rows={6} />
  if (detail.isError) {
    return detail.error instanceof ApiClientError && detail.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    )
  }
  // The URL names both the run and the run case; they must agree.
  if (detail.data.run.id !== runId) return <NotFoundPage reason="item" />
  return <Workspace key={detail.data.run_case_id} detail={detail.data} />
}
