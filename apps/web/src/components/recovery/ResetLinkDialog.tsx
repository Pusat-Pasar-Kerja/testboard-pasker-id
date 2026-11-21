import type { IssuedResetLink } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, Link2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSiteSettings } from '../../hooks/queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { Button } from '../ui/Button'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { useToast } from '../ui/toast-context'
import { invalidateRecovery, resetLinkUrl } from './reset-link'
import { ValidityBar } from './ValidityBar'

function IssuedLink({ issued }: { issued: IssuedResetLink }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const url = resetLinkUrl(issued.token)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="reset-link-url" className="text-sm font-semibold">
          {t('recovery.dialog.linkFor', { email: issued.link.user.email })}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="reset-link-url"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-canvas px-3 font-mono text-xs"
          />
          <Button
            variant="secondary"
            icon={copied ? Check : Copy}
            onClick={() =>
              void navigator.clipboard?.writeText(url).then(
                () => setCopied(true),
                () => undefined,
              )
            }
          >
            {copied ? t('actions.copied') : t('actions.copy')}
          </Button>
        </div>
      </div>
      <ValidityBar issuedAt={issued.link.issued_at} expiresAt={issued.link.expires_at} />
      <ul className="list-disc space-y-1 pl-5 text-xs text-ink-muted">
        <li>{t('recovery.dialog.tipSend')}</li>
        <li>{t('recovery.dialog.tipOnce')}</li>
        <li>{t('recovery.dialog.tipWhat')}</li>
      </ul>
    </div>
  )
}

/**
 * Issue a time-limited reset link for one account. When the account already has an active
 * link, the only way forward is "revoke and issue a new one" (never two active links).
 */
export function ResetLinkDialog({
  open,
  user,
  activeLink,
  requestId,
  onClose,
}: {
  open: boolean
  user: { id: string; display_name: string; email: string }
  activeLink: { issued_at: string; expires_at: string } | null
  requestId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const settings = useSiteSettings(open)
  const hours = settings.data?.values['recovery.link_hours']
  const [issued, setIssued] = useState<IssuedResetLink | null>(null)

  const issue = useMutation({
    mutationFn: () =>
      ds.issueResetLink(user.id, {
        ...(requestId && { request_id: requestId }),
        replace: Boolean(activeLink),
      }),
    onSuccess: async (result) => {
      setIssued(result)
      await invalidateRecovery(queryClient)
      toast.show(t('recovery.dialog.issued', { email: user.email }))
    },
    onError: () => void invalidateRecovery(queryClient),
  })

  const close = () => {
    setIssued(null)
    issue.reset()
    onClose()
  }

  if (issued) {
    return (
      <FormDialog
        open={open}
        title={t('recovery.dialog.issuedTitle')}
        submitLabel={t('actions.done')}
        hideCancel
        onSubmit={close}
        onCancel={close}
      >
        <IssuedLink issued={issued} />
      </FormDialog>
    )
  }

  // "Already has an active link" / "inactive" get their own explanation (lib/api-errors).
  const errorText = issue.isError ? apiErrorText(t, issue.error) : null

  return (
    <FormDialog
      open={open}
      title={t('recovery.dialog.title', { name: user.display_name })}
      description={user.email}
      submitLabel={activeLink ? t('recovery.dialog.replace') : t('recovery.dialog.issue')}
      busy={issue.isPending}
      onSubmit={() => issue.mutate()}
      onCancel={close}
    >
      <p className="flex gap-2 text-sm">
        <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <span>
          {hours === undefined
            ? t('recovery.dialog.bodyNoHours')
            : t('recovery.dialog.body', { count: hours })}
        </span>
      </p>
      {activeLink && (
        <div className="space-y-3 rounded-xl border border-warning/40 bg-warning-soft p-3">
          <p className="flex gap-2 text-sm text-warning">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('recovery.dialog.activeWarning')}</span>
          </p>
          <ValidityBar issuedAt={activeLink.issued_at} expiresAt={activeLink.expires_at} compact />
        </div>
      )}
      <FormAlert message={errorText} />
    </FormDialog>
  )
}
