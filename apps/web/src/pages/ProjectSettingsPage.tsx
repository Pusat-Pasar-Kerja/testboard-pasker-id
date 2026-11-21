import { codeSchema, type ModuleDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { FormDialog } from '../components/ui/FormDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useModules, useSuites } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import type { TFunction } from 'i18next'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { TeamTabs } from './MembersPage'

function apiMessage(t: TFunction, error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return t('form.alreadyUsed')
    return error.status === 422 ? t('form.invalid') : t(`errors.${error.code}`)
  }
  return t('errors.INTERNAL_ERROR')
}

/** Rename a module's code and/or name; existing test case codes keep their prefix. */
function EditModuleDialog({
  code,
  module,
  onClose,
}: {
  code: string
  module: ModuleDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [moduleCode, setModuleCode] = useState(module.module_code)
  const [name, setName] = useState(module.name)
  const [errors, setErrors] = useState<{ module_code?: string; name?: string }>({})

  const save = useMutation({
    mutationFn: () =>
      ds.updateModule(code, module.id, { module_code: moduleCode.trim(), name: name.trim() }),
    onSuccess: async (saved) => {
      // Test cases, bugs, filters and reports all show the module code.
      await queryClient.invalidateQueries()
      toast.show(t('pages.projectSettings.moduleSaved', { code: saved.module_code }))
      onClose()
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        setErrors({ module_code: t('form.alreadyUsed') })
      }
    },
  })

  const submit = () => {
    const next: { module_code?: string; name?: string } = {}
    if (!codeSchema(40).safeParse(moduleCode).success) next.module_code = t('form.invalid')
    if (!name.trim()) next.name = t('form.required')
    setErrors(next)
    if (!next.module_code && !next.name) save.mutate()
  }

  return (
    <FormDialog
      open
      title={t('pages.projectSettings.editModuleTitle', { code: module.module_code })}
      submitLabel={t('actions.save')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label={t('fields.moduleCode')}
        required
        value={moduleCode}
        maxLength={40}
        autoComplete="off"
        onChange={(e) => setModuleCode(e.target.value.toUpperCase())}
        hint={t('pages.projectSettings.moduleCodeEditHint')}
        error={errors.module_code}
      />
      <TextField
        label={t('fields.name')}
        required
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <FormAlert
        message={
          save.isError && !(save.error instanceof ApiClientError && save.error.status === 409)
            ? apiMessage(t, save.error)
            : null
        }
      />
    </FormDialog>
  )
}

function ModulesSection({ code, manage }: { code: string; manage: boolean }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const [moduleCode, setModuleCode] = useState('')
  const [name, setName] = useState('')
  const [codeError, setCodeError] = useState<string>()
  const [editing, setEditing] = useState<ModuleDto | null>(null)

  const create = useMutation({
    mutationFn: () => ds.createModule(code, { module_code: moduleCode, name: name.trim() }),
    onSuccess: async (created) => {
      setModuleCode('')
      setName('')
      await queryClient.invalidateQueries({ queryKey: ['modules', code] })
      toast.show(t('pages.projectSettings.moduleCreated', { code: created.module_code }))
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = codeSchema(40).safeParse(moduleCode)
    setCodeError(parsed.success ? undefined : t('form.required'))
    if (parsed.success && name.trim()) create.mutate()
  }

  return (
    <Section title={t('pages.projectSettings.modules')}>
      {modules.isPending && <LoadingState rows={3} />}
      {modules.isError && (
        <ErrorState error={modules.error} onRetry={() => void modules.refetch()} />
      )}
      {modules.isSuccess && modules.data.length === 0 && (
        <EmptyState description={t('pages.projectSettings.noModules')} />
      )}
      {modules.isSuccess && modules.data.length > 0 && (
        <ul className="divide-y divide-line">
          {modules.data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="w-24 shrink-0 font-semibold break-all text-brand-700">
                {m.module_code}
              </span>
              <span className="min-w-0 flex-1 break-words">{m.name}</span>
              {manage && (
                <Button
                  variant="ghost"
                  icon={Pencil}
                  aria-label={t('pages.projectSettings.editModuleTitle', { code: m.module_code })}
                  onClick={() => setEditing(m)}
                >
                  {t('pages.projectSettings.editModule')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <EditModuleDialog code={code} module={editing} onClose={() => setEditing(null)} />
      )}
      {manage && (
        <form
          onSubmit={onSubmit}
          className="mt-5 grid grid-cols-1 items-start gap-3 border-t border-line pt-5 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
        >
          <TextField
            label={t('fields.moduleCode')}
            required
            value={moduleCode}
            onChange={(e) => setModuleCode(e.target.value.toUpperCase())}
            hint={t('pages.projectSettings.moduleCodeHint')}
            error={codeError}
          />
          <TextField
            label={t('fields.name')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" icon={Plus} loading={create.isPending} className="sm:mt-6">
            {t('pages.projectSettings.addModule')}
          </Button>
          <div className="sm:col-span-3">
            <FormAlert message={create.isError ? apiMessage(t, create.error) : null} />
          </div>
        </form>
      )}
    </Section>
  )
}

function SuitesSection({ code, manage }: { code: string; manage: boolean }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const suites = useSuites(code)
  const modules = useModules(code)
  const [form, setForm] = useState({
    name: '',
    module_id: '',
    reference_document: '',
    reference_version: '',
  })

  const create = useMutation({
    mutationFn: () =>
      ds.createSuite(code, {
        name: form.name.trim(),
        module_id: form.module_id || null,
        reference_document: form.reference_document.trim() || null,
        reference_version: form.reference_version.trim() || null,
      }),
    onSuccess: async (created) => {
      setForm({ name: '', module_id: '', reference_document: '', reference_version: '' })
      await queryClient.invalidateQueries({ queryKey: ['suites', code] })
      toast.show(t('pages.projectSettings.suiteCreated', { name: created.name }))
    },
  })

  return (
    <Section title={t('pages.projectSettings.suites')}>
      {suites.isPending && <LoadingState rows={3} />}
      {suites.isError && <ErrorState error={suites.error} onRetry={() => void suites.refetch()} />}
      {suites.isSuccess && suites.data.length === 0 && (
        <EmptyState description={t('pages.projectSettings.noSuites')} />
      )}
      {suites.isSuccess && suites.data.length > 0 && (
        <ul className="divide-y divide-line">
          {suites.data.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between"
            >
              <span>
                <span className="font-medium">{s.name}</span>
                {s.module && (
                  <span className="ml-2 text-xs text-brand-700">{s.module.module_code}</span>
                )}
                {s.reference_document && (
                  <span className="block text-xs text-ink-muted">
                    {s.reference_document}
                    {s.reference_version ? ` · v${s.reference_version}` : ''}
                  </span>
                )}
              </span>
              <span className="text-xs text-ink-muted">
                {t('pages.projectSettings.caseCount', { count: s.case_count })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            if (form.name.trim()) create.mutate()
          }}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-2"
        >
          <TextField
            label={t('fields.name')}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <SelectField
            label={t('fields.module')}
            value={form.module_id}
            onChange={(e) => setForm({ ...form, module_id: e.target.value })}
            options={[
              { value: '', label: t('pages.caseForm.noModule') },
              ...(modules.data ?? []).map((m) => ({
                value: m.id,
                label: `${m.module_code} - ${m.name}`,
              })),
            ]}
          />
          <TextField
            label={t('fields.referenceDocument')}
            value={form.reference_document}
            onChange={(e) => setForm({ ...form, reference_document: e.target.value })}
          />
          <TextField
            label={t('fields.referenceVersion')}
            value={form.reference_version}
            onChange={(e) => setForm({ ...form, reference_version: e.target.value })}
          />
          <div className="sm:col-span-2">
            <FormAlert message={create.isError ? apiMessage(t, create.error) : null} />
          </div>
          <div className="sm:col-span-2 sm:flex sm:justify-end">
            <Button
              type="submit"
              icon={Plus}
              loading={create.isPending}
              className="w-full sm:w-auto"
            >
              {t('pages.projectSettings.addSuite')}
            </Button>
          </div>
        </form>
      )}
    </Section>
  )
}

export function ProjectSettingsPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  return (
    <>
      <PageHeader
        title={t('pages.members.title')}
        subtitle={can('module.manage') ? undefined : t('pages.projectSettings.readOnly')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('nav.settings') }]}
      />
      <TeamTabs code={code} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ModulesSection code={code} manage={can('module.manage')} />
        <SuitesSection code={code} manage={can('suite.write')} />
      </div>
    </>
  )
}
