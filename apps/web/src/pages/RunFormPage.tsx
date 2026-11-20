import { runCreateSchema, runUpdateSchema, type TestRunDetail } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Button, ButtonLink } from '../components/ui/Button'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCycles, useRun } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText, apiFieldErrors } from '../lib/api-errors'
import { ApiClientError } from '../services/api-client'
import type { RunInput } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

interface RunForm {
  run_code: string
  name: string
  cycle_id: string
  environment_name: string
  build_version: string
  environment_url: string
}

function fromRun(run: TestRunDetail | null): RunForm {
  return {
    run_code: run?.run_code ?? '',
    name: run?.name ?? '',
    cycle_id: run?.cycle?.id ?? '',
    environment_name: run?.environment_name ?? '',
    build_version: run?.build_version ?? '',
    environment_url: run?.environment_url ?? '',
  }
}

function RunFormBody({ existing }: { existing: TestRunDetail | null }) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const cycles = useCycles(code)
  const initial = fromRun(existing)
  const [form, setForm] = useState<RunForm>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof RunForm, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const set = (key: keyof RunForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: RunInput) =>
      existing ? ds.updateRun(code, existing.id, input) : ds.createRun(code, input),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ['runs', code] })
      await queryClient.invalidateQueries({ queryKey: ['run', code, run.id] })
      await queryClient.invalidateQueries({ queryKey: ['cycles', code] })
      toast.show(
        existing ? t('pages.runForm.saved') : t('pages.runForm.created', { code: run.run_code }),
      )
      navigate(projectPath(code, `runs/${run.id}`))
    },
    onError: (error) => {
      const fields = apiFieldErrors(error)
      if (fields.run_code) setErrors({ run_code: t('form.alreadyUsed') })
      setFormError(apiErrorText(t, error))
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const nullable = (value: string) => (value.trim() === '' ? null : value.trim())
    const full: RunInput = {
      name: form.name,
      cycle_id: nullable(form.cycle_id),
      environment_name: nullable(form.environment_name),
      build_version: nullable(form.build_version),
      environment_url: nullable(form.environment_url),
    }
    // On edit, send only what changed so the audit log stays meaningful.
    const input: RunInput = existing
      ? (Object.fromEntries(
          Object.entries(full).filter(
            ([key, value]) => (value ?? '') !== (initial[key as keyof RunForm] ?? ''),
          ),
        ) as RunInput)
      : { ...full, run_code: nullable(form.run_code)?.toUpperCase() ?? undefined }

    if (existing && Object.keys(input).length === 0) {
      navigate(projectPath(code, `runs/${existing.id}`))
      return
    }
    const result = (existing ? runUpdateSchema : runCreateSchema).safeParse(input)
    if (!result.success) {
      const next: Partial<Record<keyof RunForm, string>> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof RunForm
        next[key] =
          key === 'environment_url'
            ? t('pages.runForm.invalidUrl')
            : issue.code === 'too_small' || issue.code === 'invalid_type'
              ? t('form.required')
              : key === 'run_code'
                ? t('pages.cycles.codeHint')
                : issue.message
      }
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    save.mutate(input)
  }

  const cancelTo = existing ? projectPath(code, `runs/${existing.id}`) : projectPath(code, 'runs')

  return (
    <>
      <PageHeader
        title={
          existing
            ? t('pages.runForm.editTitle', { code: existing.run_code })
            : t('pages.runForm.newTitle')
        }
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.runs.title'), to: projectPath(code, 'runs') },
          ...(existing ? [{ label: existing.run_code, to: cancelTo }] : []),
          { label: existing ? t('actions.edit') : t('actions.create') },
        ]}
      />
      <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
        <Section>
          <div className="space-y-5">
            <TextField
              label={t('fields.name')}
              required
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              error={errors.name}
            />
            <TextField
              label={t('fields.runCode')}
              value={form.run_code}
              onChange={(e) => set('run_code')(e.target.value)}
              hint={existing ? undefined : t('pages.runForm.codeHint')}
              error={errors.run_code}
              disabled={Boolean(existing)}
              autoCapitalize="characters"
            />
            <SelectField
              label={t('fields.cycle')}
              value={form.cycle_id}
              onChange={(e) => set('cycle_id')(e.target.value)}
              options={[
                { value: '', label: t('pages.runForm.noCycle') },
                ...(cycles.data ?? []).map((cycle) => ({
                  value: cycle.id,
                  label: `${cycle.cycle_code} - ${cycle.title}`,
                })),
              ]}
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <TextField
                label={t('fields.environment')}
                value={form.environment_name}
                onChange={(e) => set('environment_name')(e.target.value)}
                error={errors.environment_name}
                placeholder="STAGING"
              />
              <TextField
                label={t('fields.build')}
                value={form.build_version}
                onChange={(e) => set('build_version')(e.target.value)}
                error={errors.build_version}
                placeholder="1.2.0-rc.1"
              />
            </div>
            <TextField
              type="url"
              label={t('fields.environmentUrl')}
              value={form.environment_url}
              onChange={(e) => set('environment_url')(e.target.value)}
              hint={t('pages.runForm.urlHint')}
              error={errors.environment_url}
              inputMode="url"
            />
          </div>
        </Section>
        <FormAlert message={formError} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink to={cancelTo} variant="secondary">
            {t('actions.cancel')}
          </ButtonLink>
          <Button type="submit" icon={Save} loading={save.isPending}>
            {t('actions.save')}
          </Button>
        </div>
      </form>
    </>
  )
}

export function RunFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const code = useProjectCode()
  const { runId = '' } = useParams()
  const can = useCan(code)
  const run = useRun(code, runId, mode === 'edit')

  if (!can('run.write')) return <NotFoundPage reason="item" />
  if (mode === 'create') return <RunFormBody existing={null} />
  if (run.isPending) return <LoadingState rows={4} />
  if (run.isError) {
    return run.error instanceof ApiClientError && run.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={run.error} onRetry={() => void run.refetch()} />
    )
  }
  if (run.data.status_code === 'LOCKED') return <NotFoundPage reason="item" />
  return <RunFormBody key={run.data.id} existing={run.data} />
}
