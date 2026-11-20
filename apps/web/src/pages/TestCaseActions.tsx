import type { TestCaseDetail, TestCaseListItem } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Copy, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { projectPath } from '../hooks/route-state'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/** Edit / duplicate / archive / restore, shown only to roles allowed to do them. */
export function TestCaseActions({ code, testCase }: { code: string; testCase: TestCaseDetail }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const can = useCan(code)
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const archived = testCase.case_status === 'ARCHIVED'

  const refresh = async (result: TestCaseListItem) => {
    await queryClient.invalidateQueries({ queryKey: ['test-cases', code] })
    await queryClient.invalidateQueries({ queryKey: ['test-case', code, result.id] })
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
  const onError = (error: unknown) =>
    toast.show(
      error instanceof ApiClientError ? t(`errors.${error.code}`) : t('errors.INTERNAL_ERROR'),
      'error',
    )

  const archive = useMutation({
    mutationFn: () => ds.archiveTestCase(code, testCase.id),
    onSuccess: async (result) => {
      setConfirmArchive(false)
      await refresh(result)
      toast.show(t('pages.caseDetail.archived', { code: result.case_code }))
    },
    onError,
  })
  const restore = useMutation({
    mutationFn: () =>
      ds.updateTestCase(code, testCase.id, {
        case_status: 'DRAFT',
        expected_version: testCase.current_version,
      }),
    onSuccess: async (result) => {
      await refresh(result)
      toast.show(t('pages.caseDetail.restored', { code: result.case_code }))
    },
    onError,
  })
  const clone = useMutation({
    mutationFn: () => ds.cloneTestCase(code, testCase.id),
    onSuccess: async (result) => {
      await refresh(result)
      toast.show(t('pages.caseDetail.cloned', { code: result.case_code }))
      navigate(projectPath(code, `test-cases/${result.id}`))
    },
    onError,
  })

  if (!can('case.write')) return null
  return (
    <>
      {archived ? (
        <Button
          variant="secondary"
          icon={ArchiveRestore}
          loading={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {t('actions.restore')}
        </Button>
      ) : (
        <ButtonLink to={projectPath(code, `test-cases/${testCase.id}/edit`)} icon={Pencil}>
          {t('actions.edit')}
        </ButtonLink>
      )}
      <Button
        variant="secondary"
        icon={Copy}
        loading={clone.isPending}
        onClick={() => clone.mutate()}
      >
        {t('actions.clone')}
      </Button>
      {!archived && can('case.archive') && (
        <Button variant="ghost" icon={Archive} onClick={() => setConfirmArchive(true)}>
          {t('actions.archive')}
        </Button>
      )}
      <ConfirmDialog
        open={confirmArchive}
        title={t('pages.caseDetail.archiveTitle', { code: testCase.case_code })}
        body={t('pages.caseDetail.archiveBody')}
        confirmLabel={t('actions.archive')}
        busy={archive.isPending}
        onConfirm={() => archive.mutate()}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  )
}
