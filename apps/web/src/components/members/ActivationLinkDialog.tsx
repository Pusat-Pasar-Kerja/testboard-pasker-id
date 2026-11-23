import { useMutation } from '@tanstack/react-query'
import { Check, Copy, KeyRound, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiErrorText } from '../../lib/api-errors'
import { formatShortDateTime, toLocale } from '../../lib/format'
import { useDataSource } from '../../services/use-data-source'
import { resetLinkUrl } from '../recovery/reset-link'
import { Button } from '../ui/Button'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'

/**
 * An Admin hands a new member the link to choose their own password (ADR 0018): copy it,
 * or open WhatsApp with a ready message. The link works once and is shown only here.
 */
export function ActivationLinkDialog({
  code,
  userId,
  name,
  onClose,
}: {
  code: string
  userId: string
  name: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const [copied, setCopied] = useState(false)
  const issue = useMutation({ mutationFn: () => ds.createActivationLink(code, userId) })
  const { mutate } = issue

  useEffect(() => {
    mutate()
  }, [mutate])

  const url = issue.data ? resetLinkUrl(issue.data.token) : ''
  const until = issue.data
    ? formatShortDateTime(issue.data.expires_at, toLocale(i18n.language))
    : ''
  const message = t('activation.whatsappText', { name, url, until })

  return (
    <FormDialog
      open
      title={t('activation.title', { name })}
      description={t('activation.intro')}
      submitLabel={t('actions.close')}
      hideCancel
      onSubmit={onClose}
      onCancel={onClose}
    >
      {issue.isPending && <p role="status">{t('activation.making')}</p>}
      <FormAlert message={issue.isError ? apiErrorText(t, issue.error) : null} />
      {issue.data && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
              <KeyRound aria-hidden="true" className="size-4" />
              {t('activation.linkLabel')}
            </p>
            <p className="mt-2 font-mono text-sm break-all">{url}</p>
            <p className="mt-2 text-xs text-ink-muted">{t('activation.validUntil', { until })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={copied ? Check : Copy}
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true))
              }}
            >
              {copied ? t('actions.copied') : t('activation.copy')}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-neutral-soft"
            >
              <MessageCircle aria-hidden="true" className="size-4 text-success" />
              {t('activation.whatsapp')}
            </a>
          </div>
          <p className="text-sm text-ink-muted">{t('activation.note')}</p>
        </div>
      )}
    </FormDialog>
  )
}
