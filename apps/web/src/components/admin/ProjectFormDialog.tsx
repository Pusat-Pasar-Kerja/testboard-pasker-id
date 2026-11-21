import { projectCreateSchema, type AdminProjectDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { projectPath } from '../../hooks/route-state'
import { apiErrorText, apiFieldErrors } from '../../lib/api-errors'
import { ApiClientError } from '../../services/api-client'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert, TextArea, TextField } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { useToast } from '../ui/toast-context'

/**
 * Create a project (Super Admin; the creator becomes its Admin) or edit an existing one's
 * name and description. Render it only while open so the fields start fresh each time.
 */
export function ProjectFormDialog({
  project,
  onClose,
}: {
  /** Absent = create a new project. */
  project?: AdminProjectDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const [code, setCode] = useState(project?.project_code ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<string | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] }),
    ])

  const fail = (error: unknown) => {
    const fields = apiFieldErrors(error)
    if (error instanceof ApiClientError && error.status === 409 && fields.project_code) {
      setErrors({ project_code: t('form.alreadyUsed') })
      return
    }
    setErrors(Object.fromEntries(Object.keys(fields).map((key) => [key, t('form.invalid')])))
    setAlert(apiErrorText(t, error))
  }

  const save = useMutation({
    mutationFn: async () => {
      if (project) {
        return ds.updateAdminProject(project.id, {
          name: name.trim(),
          description: description.trim() || null,
        })
      }
      return ds.createProject({
        project_code: code,
        name: name.trim(),
        description: description.trim() || null,
      })
    },
    onSuccess: async (saved) => {
      await refresh()
      if (project) {
        toast.show(t('pages.adminProjects.saved'))
        onClose()
        return
      }
      toast.show(t('pages.adminProjects.created', { code: saved.project_code }))
      onClose()
      navigate(projectPath(saved.project_code))
    },
    onError: fail,
  })

  const submit = () => {
    setAlert(null)
    if (!project) {
      const parsed = projectCreateSchema.safeParse({
        project_code: code,
        name,
        description: description || null,
      })
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [String(issue.path[0]), t('form.invalid')]),
          ),
        )
        return
      }
    } else if (!name.trim()) {
      setErrors({ name: t('form.invalid') })
      return
    }
    setErrors({})
    save.mutate()
  }

  return (
    <FormDialog
      open
      title={
        project
          ? t('pages.adminProjects.editTitle', { code: project.project_code })
          : t('pages.adminProjects.createTitle')
      }
      description={project ? undefined : t('pages.adminProjects.createHint')}
      submitLabel={project ? t('actions.save') : t('pages.adminProjects.create')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      {!project && (
        <TextField
          label={t('pages.adminProjects.code')}
          hint={t('pages.adminProjects.codeHint')}
          required
          value={code}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
          error={errors.project_code}
        />
      )}
      <TextField
        label={t('pages.adminProjects.name')}
        required
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <TextArea
        label={t('pages.adminProjects.description')}
        value={description}
        maxLength={5000}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
      />
      <FormAlert message={alert} />
    </FormDialog>
  )
}
