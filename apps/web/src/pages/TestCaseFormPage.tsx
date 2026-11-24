import {
  TEST_CASE_PRIORITIES,
  TEST_TYPES,
  testCaseCreateSchema,
  testCaseUpdateSchema,
  type TestCaseDetail,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextArea, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCycles, useModules, useSuites, useTestCase } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { ApiClientError } from '../services/api-client'
import type { TestCaseInput } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

interface FormState {
  case_code: string
  cycle_id: string
  module_code: string
  suite_id: string
  category: string
  title: string
  requirement_refs: string
  priority_code: string
  test_type_code: string
  actor_label: string
  preconditions: string
  test_steps_text: string
  expected_result: string
  case_status: string
  change_reason: string
}

const EMPTY: FormState = {
  case_code: '',
  cycle_id: '',
  module_code: '',
  suite_id: '',
  category: '',
  title: '',
  requirement_refs: '',
  priority_code: 'MUST_HAVE',
  test_type_code: 'POSITIVE',
  actor_label: '',
  preconditions: '',
  test_steps_text: '',
  expected_result: '',
  case_status: 'DRAFT',
  change_reason: '',
}

function fromCase(c: TestCaseDetail, suiteId: string): FormState {
  return {
    case_code: c.case_code,
    cycle_id: c.cycle?.id ?? '',
    module_code: c.module?.module_code ?? '',
    suite_id: suiteId,
    category: c.category ?? '',
    title: c.title,
    requirement_refs: c.requirement_refs ?? '',
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    actor_label: c.actor_label ?? '',
    preconditions: c.preconditions ?? '',
    test_steps_text: c.test_steps_text ?? '',
    expected_result: c.expected_result ?? '',
    case_status: c.case_status === 'READY' ? 'READY' : 'DRAFT',
    change_reason: '',
  }
}

/** Only fields the user actually changed are sent on edit (smaller revision diffs). */
function toInput(form: FormState, initial: FormState | null): TestCaseInput {
  const nullable = (v: string) => (v.trim() === '' ? null : v)
  const full: TestCaseInput = {
    cycle_id: nullable(form.cycle_id),
    module_code: nullable(form.module_code),
    suite_id: nullable(form.suite_id),
    category: nullable(form.category),
    title: form.title,
    requirement_refs: nullable(form.requirement_refs),
    priority_code: form.priority_code as TestCaseInput['priority_code'],
    test_type_code: form.test_type_code as TestCaseInput['test_type_code'],
    actor_label: nullable(form.actor_label),
    preconditions: nullable(form.preconditions),
    test_steps_text: nullable(form.test_steps_text),
    expected_result: form.expected_result,
    case_status: form.case_status as 'DRAFT' | 'READY',
  }
  if (!initial) return { ...full, case_code: form.case_code.trim() || undefined }
  const changed = Object.fromEntries(
    Object.entries(full).filter(
      ([key, value]) => String(value ?? '') !== String(initial[key as keyof FormState] ?? ''),
    ),
  ) as TestCaseInput
  return { ...changed, change_reason: nullable(form.change_reason) }
}

function CaseForm({ existing }: { existing: TestCaseDetail | null }) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const suites = useSuites(code)
  const cycles = useCycles(code)
  // "Skenario baru" from inside a feature folder: that Fase and feature are filled in.
  const [params] = useSearchParams()
  const fromFolder = {
    cycle_id: params.get('fase') ?? '',
    module_code: params.get('fitur') ?? '',
  }

  const suiteId = (existing && suites.data?.find((s) => s.name === existing.suite_name)?.id) || ''
  const initial = existing ? fromCase(existing, suiteId) : { ...EMPTY, ...fromFolder }
  const [form, setForm] = useState<FormState>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  // Set right before navigating away after a successful save, so the guard lets it through.
  const allowLeave = useRef(false)

  // Suites load async: fill the suite once known, without counting it as a user change.
  const [suiteSynced, setSuiteSynced] = useState(!existing)
  if (!suiteSynced && suites.isSuccess) {
    setSuiteSynced(true)
    setForm((f) => ({ ...f, suite_id: suiteId }))
  }

  const baseline = existing ? { ...initial, suite_id: suiteId } : initial
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const blocker = useBlocker(() => dirty && !allowLeave.current)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: TestCaseInput) =>
      existing
        ? ds.updateTestCase(code, existing.id, {
            ...input,
            expected_version: existing.current_version,
          })
        : ds.createTestCase(code, input),
    onSuccess: async (result) => {
      allowLeave.current = true
      await queryClient.invalidateQueries({ queryKey: ['test-cases', code] })
      await queryClient.invalidateQueries({ queryKey: ['test-case', code, result.id] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.show(
        existing
          ? t('pages.caseForm.saved', { version: result.current_version })
          : t('pages.caseForm.created', { code: result.case_code }),
      )
      navigate(projectPath(code, `test-cases/${result.id}`))
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        const fields = error.fieldErrors()
        if (Object.keys(fields).length > 0) {
          setErrors(
            Object.fromEntries(
              Object.entries(fields).map(([field, message]) => [
                field,
                error.status === 409 && field === 'case_code' ? t('form.alreadyUsed') : message,
              ]),
            ),
          )
        }
        setFormError(
          error.status === 409 && !fields.case_code
            ? t('form.conflict')
            : error.status === 422
              ? t('form.invalid')
              : t(`errors.${error.code}`),
        )
      } else {
        setFormError(t('errors.INTERNAL_ERROR'))
      }
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const input = toInput(form, existing ? baseline : null)
    const schema = existing ? testCaseUpdateSchema : testCaseCreateSchema
    const result = schema.safeParse(input)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof FormState
        if (key in EMPTY) {
          fieldErrors[key] =
            issue.code === 'too_small' && 'minimum' in issue && Number(issue.minimum) > 1
              ? t('form.tooShort', { min: Number(issue.minimum) })
              : issue.code === 'too_small' || issue.code === 'invalid_type'
                ? t('form.required')
                : issue.message
        }
      }
      setErrors(fieldErrors)
      if (existing && Object.keys(fieldErrors).length === 0) {
        // The only possible failure left is "nothing to update": just go back.
        navigate(projectPath(code, `test-cases/${existing.id}`))
        return
      }
      setFormError(t('form.invalid'))
      return
    }
    save.mutate(input)
  }

  const title = existing
    ? t('pages.caseForm.editTitle', { code: existing.case_code })
    : t('pages.caseForm.newTitle')
  const folderModule = modules.data?.find((m) => m.module_code === fromFolder.module_code)
  const cancelTo = existing
    ? projectPath(code, `test-cases/${existing.id}`)
    : fromFolder.cycle_id && folderModule
      ? projectPath(code, `fase/${fromFolder.cycle_id}/fitur/${folderModule.id}`)
      : projectPath(code, 'test-cases')

  return (
    <>
      <PageHeader
        title={title}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.cases.title'), to: projectPath(code, 'test-cases') },
          ...(existing ? [{ label: existing.case_code, to: cancelTo }] : []),
          { label: existing ? t('actions.edit') : t('actions.create') },
        ]}
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Section>
            <div className="space-y-5">
              <TextField
                label={t('fields.title')}
                required
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
                error={errors.title}
              />
              <TextArea
                label={t('fields.preconditions')}
                value={form.preconditions}
                onChange={(e) => set('preconditions')(e.target.value)}
                error={errors.preconditions}
                rows={3}
              />
              <TextArea
                label={t('fields.testSteps')}
                value={form.test_steps_text}
                onChange={(e) => set('test_steps_text')(e.target.value)}
                hint={t('pages.caseForm.stepsHint')}
                error={errors.test_steps_text}
                rows={6}
                placeholder={'1. ...\n2. ...'}
              />
              <TextArea
                label={t('fields.expectedResult')}
                required
                value={form.expected_result}
                onChange={(e) => set('expected_result')(e.target.value)}
                error={errors.expected_result}
                rows={3}
              />
            </div>
          </Section>
          <Section>
            <div className="space-y-5">
              <TextField
                label={t('fields.caseCode')}
                value={form.case_code}
                onChange={(e) => set('case_code')(e.target.value)}
                hint={existing ? undefined : t('pages.caseForm.codeHint')}
                error={errors.case_code}
                disabled={Boolean(existing)}
                autoCapitalize="characters"
              />
              <SelectField
                label={t('fields.phase')}
                value={form.cycle_id}
                onChange={(e) => set('cycle_id')(e.target.value)}
                error={errors.cycle_id}
                hint={t('pages.caseForm.phaseHint')}
                options={[
                  { value: '', label: t('phases.unassigned') },
                  ...(cycles.data ?? []).map((c) => ({
                    value: c.id,
                    label: `${c.cycle_code} - ${c.title}`,
                  })),
                ]}
              />
              <SelectField
                label={t('fields.feature')}
                value={form.module_code}
                onChange={(e) => set('module_code')(e.target.value)}
                error={errors.module_code}
                options={[
                  { value: '', label: t('pages.caseForm.noModule') },
                  ...(modules.data ?? []).map((m) => ({
                    value: m.module_code,
                    label: `${m.module_code} - ${m.name}`,
                  })),
                ]}
              />
              <SelectField
                label={t('fields.suite')}
                value={form.suite_id}
                onChange={(e) => set('suite_id')(e.target.value)}
                error={errors.suite_id}
                options={[
                  { value: '', label: t('pages.caseForm.noSuite') },
                  ...(suites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <TextField
                label={t('fields.category')}
                value={form.category}
                onChange={(e) => set('category')(e.target.value)}
                error={errors.category}
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1">
                <SelectField
                  label={t('fields.priority')}
                  required
                  value={form.priority_code}
                  onChange={(e) => set('priority_code')(e.target.value)}
                  options={TEST_CASE_PRIORITIES.map((p) => ({
                    value: p,
                    label: t(`codes.casePriority.${p}`),
                  }))}
                />
                <SelectField
                  label={t('fields.type')}
                  required
                  value={form.test_type_code}
                  onChange={(e) => set('test_type_code')(e.target.value)}
                  options={TEST_TYPES.map((type) => ({
                    value: type,
                    label: t(`codes.testType.${type}`),
                  }))}
                />
              </div>
              <TextField
                label={t('fields.actor')}
                value={form.actor_label}
                onChange={(e) => set('actor_label')(e.target.value)}
                error={errors.actor_label}
              />
              <TextField
                label={t('fields.requirementRefs')}
                value={form.requirement_refs}
                onChange={(e) => set('requirement_refs')(e.target.value)}
                error={errors.requirement_refs}
              />
              <SelectField
                label={t('fields.status')}
                required
                value={form.case_status}
                onChange={(e) => set('case_status')(e.target.value)}
                hint={t('pages.caseForm.statusHint')}
                options={(['DRAFT', 'READY'] as const).map((s) => ({
                  value: s,
                  label: t(`codes.caseStatus.${s}`),
                }))}
              />
              {existing && (
                <TextField
                  label={t('pages.caseForm.changeReason')}
                  value={form.change_reason}
                  onChange={(e) => set('change_reason')(e.target.value)}
                  hint={t('pages.caseForm.changeReasonHint')}
                />
              )}
            </div>
          </Section>
        </div>

        {existing && (
          <p className="text-sm text-ink-muted">
            {t('pages.caseForm.versionNote', { next: existing.current_version + 1 })}
          </p>
        )}
        <FormAlert message={formError} />
        <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-xl sm:border sm:bg-surface">
          <ButtonLink to={cancelTo} variant="secondary">
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

export function TestCaseFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const code = useProjectCode()
  const { caseId = '' } = useParams()
  const can = useCan(code)
  const testCase = useTestCase(code, caseId, mode === 'edit')

  if (!can('case.write')) return <NotFoundPage reason="item" />
  if (mode === 'create') return <CaseForm existing={null} />
  if (testCase.isPending) return <LoadingState rows={6} />
  if (testCase.isError) {
    return testCase.error instanceof ApiClientError && testCase.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={testCase.error} onRetry={() => void testCase.refetch()} />
    )
  }
  return <CaseForm key={testCase.data.id} existing={testCase.data} />
}
