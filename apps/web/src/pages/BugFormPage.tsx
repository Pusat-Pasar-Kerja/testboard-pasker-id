import {
  DEFECT_FIELDS,
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_SOURCE_KINDS,
  defectCreateSchema,
  defectEditableFields,
  defectUpdateSchema,
  type DefectActor,
  type DefectDetail,
  type DefectField,
  type AttachedFileDto,
  type ModuleDto,
  type RunCaseDetail,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Save } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { EvidenceUploader } from '../components/evidence/EvidenceUploader'
import { useEvidenceUploads } from '../components/evidence/use-evidence-uploads'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextArea, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan, useDefectActor } from '../hooks/permissions'
import {
  invalidateDefectData,
  useCycles,
  useDefect,
  useMembers,
  useModules,
  useRunCase,
} from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText, apiFieldErrors, serverText } from '../lib/api-errors'
import { newIdempotencyKey } from '../lib/idempotency'
import { ApiClientError } from '../services/api-client'
import type { DefectInput } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

type BugForm = Record<DefectField | 'source_kind', string>

const EMPTY: BugForm = {
  title: '',
  description: '',
  steps_to_reproduce: '',
  expected_behavior: '',
  actual_behavior: '',
  module_id: '',
  cycle_id: '',
  severity_code: 'MEDIUM',
  priority_code: 'MEDIUM',
  source_kind: 'UAT',
  environment_name: '',
  build_version: '',
  browser_name: '',
  assigned_to: '',
  fixed_in_version: '',
}

/** Where the bug came from when reported from the execution workspace (TB-BUG-001). */
interface AttemptLink {
  executionId: string
  runId: string
  runCaseId: string
  runCode: string
  caseCode: string
  attempt: number
  /** Evidence of that attempt, offered for reuse on the bug (same file, no copy). */
  files: AttachedFileDto[]
}

function fromDefect(d: DefectDetail): BugForm {
  return {
    title: d.title,
    description: d.description ?? '',
    steps_to_reproduce: d.steps_to_reproduce ?? '',
    expected_behavior: d.expected_behavior ?? '',
    actual_behavior: d.actual_behavior ?? '',
    module_id: d.module?.id ?? '',
    cycle_id: d.cycle?.id ?? '',
    severity_code: d.severity_code,
    priority_code: d.priority_code,
    source_kind: d.source_kind,
    environment_name: d.environment_name ?? '',
    build_version: d.build_version ?? '',
    browser_name: d.browser_name ?? '',
    assigned_to: d.assigned_to?.id ?? '',
    fixed_in_version: d.fixed_in_version ?? '',
  }
}

/** Prefill from the failed attempt: the tester only reviews and completes it. */
function fromAttempt(
  detail: RunCaseDetail,
  executionId: string,
  modules: ModuleDto[],
): { form: BugForm; link: AttemptLink } | null {
  const attempt = detail.attempts.find((a) => a.id === executionId) ?? detail.attempts[0]
  if (!attempt) return null
  const snap = detail.snapshot
  const firstLine = (attempt.actual_result ?? '').split('\n')[0]?.trim() ?? ''
  return {
    form: {
      ...EMPTY,
      title: (firstLine.length >= 3 ? firstLine : snap.title).slice(0, 200),
      steps_to_reproduce:
        snap.test_steps_text ??
        snap.steps.map((s) => `${s.step_number}. ${s.instruction}`).join('\n'),
      expected_behavior: snap.expected_result ?? '',
      actual_behavior: attempt.actual_result ?? attempt.notes ?? '',
      module_id: modules.find((m) => m.module_code === snap.module_code)?.id ?? '',
      environment_name: detail.run.environment_name ?? '',
      build_version: detail.run.build_version ?? '',
      browser_name: attempt.browser_name ?? '',
    },
    link: {
      executionId: attempt.id,
      runId: detail.run.id,
      runCaseId: detail.run_case_id,
      runCode: detail.run.run_code,
      caseCode: snap.case_code,
      attempt: attempt.attempt_number,
      files: attempt.files,
    },
  }
}

function BugFormBody({
  existing,
  initial,
  link,
  actor,
}: {
  existing: DefectDetail | null
  initial: BugForm
  link: AttemptLink | null
  actor: DefectActor
}) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const cycles = useCycles(code)
  const members = useMembers(code)
  const [form, setForm] = useState<BugForm>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof BugForm, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const idempotencyKey = useRef(newIdempotencyKey())
  const allowLeave = useRef(false)
  const uploads = useEvidenceUploads(code)
  const [reuse, setReuse] = useState<Set<string>>(
    () => new Set((link?.files ?? []).map((f) => f.id)),
  )

  const isLead = actor.role === 'ADMIN' || actor.role === 'QA_LEAD'
  const editable = new Set<string>(
    existing ? defectEditableFields(actor) : DEFECT_FIELDS.filter((f) => f !== 'fixed_in_version'),
  )
  if (!existing) editable.add('source_kind')
  if (!existing && !isLead) editable.delete('assigned_to')
  const locked = (field: keyof BugForm) => !editable.has(field)

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || uploads.items.length > 0
  const blocker = useBlocker(() => dirty && !allowLeave.current)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (key: keyof BugForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const backTo = existing
    ? projectPath(code, `bugs/${existing.id}`)
    : link
      ? projectPath(code, `runs/${link.runId}/cases/${link.runCaseId}`)
      : projectPath(code, 'bugs')

  const save = useMutation({
    mutationFn: (input: DefectInput) =>
      existing
        ? ds.updateDefect(code, existing.id, input)
        : ds.createDefect(code, input, idempotencyKey.current),
    onSuccess: async (bug) => {
      allowLeave.current = true
      uploads.clear()
      await invalidateDefectData(queryClient, code)
      toast.show(
        existing ? t('pages.bugForm.saved') : t('pages.bugForm.created', { code: bug.bug_code }),
      )
      // Reported from a test: go back to testing. Otherwise show the bug.
      navigate(link && !existing ? backTo : projectPath(code, `bugs/${bug.id}`))
    },
    onError: (error) => {
      const fields = apiFieldErrors(error)
      setErrors(
        Object.fromEntries(
          Object.entries(fields).map(([field, message]) => [
            field,
            error instanceof ApiClientError && error.status === 403
              ? t('pages.bugForm.lockedField')
              : (serverText(t, message) ?? t('form.invalid')),
          ]),
        ),
      )
      setFormError(
        error instanceof ApiClientError && error.status === 409 && !fields.bug_code
          ? t('form.conflict')
          : apiErrorText(t, error),
      )
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (uploads.busy) {
      setFormError(t('evidence.waitUploads'))
      return
    }
    const value = (field: keyof BugForm) => (form[field].trim() === '' ? null : form[field])
    const full: DefectInput = {
      title: form.title,
      description: value('description'),
      steps_to_reproduce: value('steps_to_reproduce'),
      expected_behavior: value('expected_behavior'),
      actual_behavior: value('actual_behavior'),
      module_id: value('module_id'),
      cycle_id: value('cycle_id'),
      severity_code: form.severity_code as DefectInput['severity_code'],
      priority_code: form.priority_code as DefectInput['priority_code'],
      environment_name: value('environment_name'),
      build_version: value('build_version'),
      browser_name: value('browser_name'),
      assigned_to: value('assigned_to'),
      fixed_in_version: value('fixed_in_version'),
    }
    let input: DefectInput
    if (existing) {
      // Only fields this user may edit and actually changed (smaller audit diff).
      const changed = Object.fromEntries(
        Object.entries(full).filter(
          ([key, v]) =>
            editable.has(key) && String(v ?? '') !== String(initial[key as keyof BugForm] ?? ''),
        ),
      )
      if (Object.keys(changed).length === 0) {
        navigate(backTo)
        return
      }
      input = { ...changed, expected_updated_at: existing.updated_at }
    } else {
      input = {
        ...full,
        fixed_in_version: undefined,
        assigned_to: isLead ? full.assigned_to : undefined,
        source_kind: form.source_kind as DefectInput['source_kind'],
        ...(link ? { execution_ids: [link.executionId] } : {}),
      }
      const evidence = [
        ...(link?.files ?? [])
          .filter((f) => reuse.has(f.id))
          .map((f) => ({ file_id: f.id, caption: f.caption })),
        ...uploads.refs,
      ]
      if (evidence.length > 0) input.evidence = evidence
    }
    const result = (existing ? defectUpdateSchema : defectCreateSchema).safeParse(input)
    if (!result.success) {
      const next: Partial<Record<keyof BugForm, string>> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof BugForm
        next[key] =
          issue.code === 'too_small' && 'minimum' in issue && Number(issue.minimum) > 1
            ? t('form.tooShort', { min: Number(issue.minimum) })
            : issue.code === 'too_small' || issue.code === 'invalid_type'
              ? t('form.required')
              : issue.message
      }
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    save.mutate(input)
  }

  const assignees = (members.data ?? []).filter((m) => m.user.is_active && m.role_code !== 'VIEWER')
  const someLocked = existing !== null && editable.size < DEFECT_FIELDS.length

  return (
    <>
      <PageHeader
        title={
          existing
            ? t('pages.bugForm.editTitle', { code: existing.bug_code })
            : t('pages.bugForm.newTitle')
        }
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.bugs.title'), to: projectPath(code, 'bugs') },
          ...(existing ? [{ label: existing.bug_code, to: backTo }] : []),
          { label: existing ? t('actions.edit') : t('actions.create') },
        ]}
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {link && (
          <p className="flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft p-3 text-sm text-info">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('pages.bugForm.fromExecution', {
              run: link.runCode,
              case: link.caseCode,
              n: link.attempt,
            })}
          </p>
        )}
        {someLocked && (
          <p className="flex items-start gap-2 rounded-xl border border-line bg-neutral-soft p-3 text-sm text-ink-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('pages.bugForm.lockedField')}
          </p>
        )}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Section title={t('pages.bugForm.describe')}>
              <div className="space-y-5">
                <TextField
                  label={t('fields.title')}
                  required
                  value={form.title}
                  onChange={(e) => set('title')(e.target.value)}
                  hint={t('pages.bugForm.titleHint')}
                  error={errors.title}
                  disabled={locked('title')}
                />
                <TextArea
                  label={t('fields.description')}
                  value={form.description}
                  onChange={(e) => set('description')(e.target.value)}
                  error={errors.description}
                  disabled={locked('description')}
                  rows={3}
                />
                <TextArea
                  label={t('fields.stepsToReproduce')}
                  value={form.steps_to_reproduce}
                  onChange={(e) => set('steps_to_reproduce')(e.target.value)}
                  error={errors.steps_to_reproduce}
                  disabled={locked('steps_to_reproduce')}
                  rows={5}
                  placeholder={'1. ...\n2. ...'}
                />
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <TextArea
                    label={t('fields.expectedBehavior')}
                    value={form.expected_behavior}
                    onChange={(e) => set('expected_behavior')(e.target.value)}
                    error={errors.expected_behavior}
                    disabled={locked('expected_behavior')}
                    rows={3}
                  />
                  <TextArea
                    label={t('fields.actualBehavior')}
                    value={form.actual_behavior}
                    onChange={(e) => set('actual_behavior')(e.target.value)}
                    error={errors.actual_behavior}
                    disabled={locked('actual_behavior')}
                    rows={3}
                  />
                </div>
              </div>
            </Section>

            {!existing && (
              <Section title={t('pages.execution.evidenceHeading')}>
                <div className="space-y-4">
                  {link && link.files.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="mb-1 text-sm font-medium">
                        {t('pages.bugForm.attemptFiles', { n: link.attempt })}
                      </legend>
                      {link.files.map((file) => (
                        <label
                          key={file.id}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm hover:bg-brand-50/60"
                        >
                          <input
                            type="checkbox"
                            className="size-4.5 accent-brand-700"
                            checked={reuse.has(file.id)}
                            onChange={() =>
                              setReuse((prev) => {
                                const next = new Set(prev)
                                if (next.has(file.id)) next.delete(file.id)
                                else next.add(file.id)
                                return next
                              })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {file.caption ?? file.original_filename}
                          </span>
                          <span className="text-xs text-ink-muted">
                            {t(`codes.evidenceType.${file.evidence_type}`)}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <EvidenceUploader
                    uploads={uploads}
                    label={link && link.files.length > 0 ? t('pages.bugForm.newFiles') : undefined}
                  />
                </div>
              </Section>
            )}
          </div>

          <div className="space-y-6">
            <Section title={t('pages.bugForm.classify')}>
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <SelectField
                    label={t('fields.severity')}
                    required
                    value={form.severity_code}
                    onChange={(e) => set('severity_code')(e.target.value)}
                    disabled={locked('severity_code')}
                    options={DEFECT_SEVERITIES.map((s) => ({
                      value: s,
                      label: t(`codes.severity.${s}`),
                    }))}
                  />
                  <SelectField
                    label={t('fields.priority')}
                    required
                    value={form.priority_code}
                    onChange={(e) => set('priority_code')(e.target.value)}
                    disabled={locked('priority_code')}
                    options={DEFECT_PRIORITIES.map((p) => ({
                      value: p,
                      label: t(`codes.defectPriority.${p}`),
                    }))}
                  />
                </div>
                <SelectField
                  label={t('fields.module')}
                  value={form.module_id}
                  onChange={(e) => set('module_id')(e.target.value)}
                  error={errors.module_id}
                  disabled={locked('module_id')}
                  options={[
                    { value: '', label: t('pages.bugForm.noModule') },
                    ...(modules.data ?? []).map((m) => ({
                      value: m.id,
                      label: `${m.module_code} - ${m.name}`,
                    })),
                  ]}
                />
                <SelectField
                  label={t('fields.cycle')}
                  hint={link ? t('pages.bugForm.cycleFromRun') : undefined}
                  value={form.cycle_id}
                  onChange={(e) => set('cycle_id')(e.target.value)}
                  error={errors.cycle_id}
                  disabled={locked('cycle_id')}
                  options={[
                    { value: '', label: t('pages.bugForm.noCycle') },
                    ...(cycles.data ?? []).map((cy) => ({
                      value: cy.id,
                      label: `${cy.cycle_code} - ${cy.title}`,
                    })),
                  ]}
                />
                <SelectField
                  label={t('fields.source')}
                  required
                  value={form.source_kind}
                  onChange={(e) => set('source_kind')(e.target.value)}
                  disabled={locked('source_kind')}
                  options={DEFECT_SOURCE_KINDS.map((s) => ({
                    value: s,
                    label: t(`codes.defectSource.${s}`),
                  }))}
                />
                <SelectField
                  label={t('fields.assignee')}
                  value={form.assigned_to}
                  onChange={(e) => set('assigned_to')(e.target.value)}
                  error={errors.assigned_to}
                  disabled={locked('assigned_to')}
                  hint={locked('assigned_to') ? t('pages.bugForm.assigneeHint') : undefined}
                  options={[
                    { value: '', label: t('pages.bugForm.unassigned') },
                    ...assignees.map((m) => ({
                      value: m.user.id,
                      label: `${m.user.display_name} (${t(`codes.role.${m.role_code}`)})`,
                    })),
                  ]}
                />
                {existing && (
                  <TextField
                    label={t('fields.fixedIn')}
                    value={form.fixed_in_version}
                    onChange={(e) => set('fixed_in_version')(e.target.value)}
                    error={errors.fixed_in_version}
                    disabled={locked('fixed_in_version')}
                  />
                )}
              </div>
            </Section>

            <Section title={t('pages.bugForm.environment')}>
              <div className="space-y-5">
                <TextField
                  label={t('fields.environment')}
                  value={form.environment_name}
                  onChange={(e) => set('environment_name')(e.target.value)}
                  error={errors.environment_name}
                  disabled={locked('environment_name')}
                  placeholder="STAGING"
                />
                <TextField
                  label={t('fields.build')}
                  value={form.build_version}
                  onChange={(e) => set('build_version')(e.target.value)}
                  error={errors.build_version}
                  disabled={locked('build_version')}
                />
                <TextField
                  label={t('fields.browser')}
                  value={form.browser_name}
                  onChange={(e) => set('browser_name')(e.target.value)}
                  error={errors.browser_name}
                  disabled={locked('browser_name')}
                  placeholder="Chrome 131"
                />
              </div>
            </Section>
          </div>
        </div>

        <FormAlert message={formError} />
        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:bg-surface">
          <ButtonLink to={backTo} variant="secondary">
            {t('actions.cancel')}
          </ButtonLink>
          <Button type="submit" icon={Save} loading={save.isPending}>
            {t('actions.save')}
          </Button>
        </div>
      </form>

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

export function BugFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const code = useProjectCode()
  const { bugId = '' } = useParams()
  const [params] = useSearchParams()
  const runCaseId = mode === 'create' ? (params.get('runCase') ?? '') : ''
  const executionId = params.get('execution') ?? ''
  const can = useCan(code)
  const defect = useDefect(code, bugId, mode === 'edit')
  const source = useRunCase(code, runCaseId, Boolean(runCaseId))
  const modules = useModules(code)
  const actor = useDefectActor(code, defect.data)

  if (mode === 'create' && !can('defect.create')) return <NotFoundPage reason="item" />
  if (!actor) return <LoadingState rows={6} />

  if (mode === 'edit') {
    if (defect.isPending) return <LoadingState rows={6} />
    if (defect.isError) {
      return defect.error instanceof ApiClientError && defect.error.status === 404 ? (
        <NotFoundPage reason="item" />
      ) : (
        <ErrorState error={defect.error} onRetry={() => void defect.refetch()} />
      )
    }
    if (defectEditableFields(actor).length === 0) return <NotFoundPage reason="item" />
    return (
      <BugFormBody
        key={defect.data.id}
        existing={defect.data}
        initial={fromDefect(defect.data)}
        link={null}
        actor={actor}
      />
    )
  }

  if (runCaseId) {
    if (source.isPending || modules.isPending) return <LoadingState rows={6} />
    if (source.isError)
      return <ErrorState error={source.error} onRetry={() => void source.refetch()} />
    const prefill = fromAttempt(source.data, executionId, modules.data ?? [])
    if (prefill) {
      return (
        <BugFormBody
          key={prefill.link.executionId}
          existing={null}
          initial={prefill.form}
          link={prefill.link}
          actor={actor}
        />
      )
    }
  }
  return <BugFormBody existing={null} initial={EMPTY} link={null} actor={actor} />
}
