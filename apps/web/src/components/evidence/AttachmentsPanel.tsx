import type { AttachedFileDto, EvidenceRef } from '@testboard/shared'
import { useMutation } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiErrorText } from '../../lib/api-errors'
import { Button } from '../ui/Button'
import { useToast } from '../ui/toast-context'
import { EvidenceGallery } from './EvidenceGallery'
import { EvidenceUploader } from './EvidenceUploader'
import { useEvidenceUploads } from './use-evidence-uploads'

/** Attached files of a bug or test case, with upload + attach for permitted users. */
export function AttachmentsPanel({
  projectCode,
  files,
  canAttach,
  canDetach,
  onAttach,
  onDetach,
}: {
  projectCode: string
  files: AttachedFileDto[]
  canAttach: boolean
  canDetach: (file: AttachedFileDto) => boolean
  onAttach: (refs: EvidenceRef[]) => Promise<unknown>
  onDetach: (fileId: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const uploads = useEvidenceUploads(projectCode)
  const attach = useMutation({
    mutationFn: () => onAttach(uploads.refs),
    onSuccess: () => {
      toast.show(t('evidence.attached', { count: uploads.refs.length }))
      uploads.clear()
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  const detach = useMutation({
    mutationFn: (fileId: string) => onDetach(fileId),
    onSuccess: () => toast.show(t('evidence.detached')),
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })

  return (
    <div className="space-y-4">
      {files.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('evidence.empty')}</p>
      ) : (
        <EvidenceGallery
          projectCode={projectCode}
          files={files}
          canDetach={canDetach}
          onDetach={(file) => detach.mutate(file.id)}
        />
      )}
      {canAttach && (
        <div className="space-y-2 border-t border-line pt-4">
          <EvidenceUploader uploads={uploads} />
          {uploads.items.length > 0 && (
            <div className="flex justify-end">
              <Button
                icon={Paperclip}
                disabled={uploads.readyCount === 0 || uploads.busy}
                loading={attach.isPending}
                onClick={() => attach.mutate()}
              >
                {t('evidence.attach', { count: uploads.readyCount })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
