import {
  normalizePublicFields,
  type BugReportingSettings,
  type PublicField,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, MessageSquarePlus, Save, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { Button } from '../ui/Button'
import { FormAlert, TextArea } from '../ui/Form'
import { Section } from '../ui/Section'
import { useToast } from '../ui/toast-context'
import { PublicFieldChecklist, PublicHowTo, PublicSwitch } from '../workshop/admin/PublicTab'

const onlyBugs = (fields: readonly PublicField[]) =>
  normalizePublicFields([...fields]).filter((f) => f.startsWith('bugs.'))

/**
 * Bug Reporting on the public pages (ADR 0019): its own ON/OFF switch, the fields the
 * public may see, and the public report form (every report waits for an Admin).
 */
export function BugPublicTab({ code, settings }: { code: string; settings: BugReportingSettings }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [isPublic, setIsPublic] = useState(settings.is_public)
  const [acceptReports, setAcceptReports] = useState(settings.accept_reports)
  const [fields, setFields] = useState<PublicField[]>(settings.public_fields)
  const [intro, setIntro] = useState(settings.public_intro ?? '')
  const effective = onlyBugs(fields)
  const save = useMutation({
    mutationFn: () =>
      ds.updateBugReporting(code, {
        is_public: isPublic,
        public_fields: effective,
        public_intro: intro.trim() || null,
        accept_reports: acceptReports,
      }),
    onSuccess: async (saved) => {
      setFields(saved.public_fields)
      await queryClient.invalidateQueries({ queryKey: ['bug-reporting', code] })
      await queryClient.invalidateQueries({ queryKey: ['public'] })
      toast.show(
        t(saved.is_public ? 'bugReporting.public.savedOn' : 'bugReporting.public.savedOff'),
      )
    },
  })
  const toggle = (field: PublicField) =>
    setFields((list) => (list.includes(field) ? list.filter((f) => f !== field) : [...list, field]))
  const dirty =
    isPublic !== settings.is_public ||
    acceptReports !== settings.accept_reports ||
    (intro.trim() || null) !== settings.public_intro ||
    effective.join() !== settings.public_fields.join()
  const publicUrl = `/publik/masalah/${encodeURIComponent(code)}`

  return (
    <div className="space-y-6">
      <PublicHowTo
        title={t('bugReporting.public.howTitle')}
        steps={(['step1', 'step2', 'step3'] as const).map((step) =>
          t(`bugReporting.public.how.${step}`),
        )}
        previewUrl={`${publicUrl}?pratinjau=1`}
        previewLabel={t('workshop.public.previewButton')}
      />
      <Section title={t('bugReporting.public.mainTitle')}>
        <div className="space-y-5">
          <PublicSwitch
            checked={isPublic}
            onChange={setIsPublic}
            title={t('bugReporting.public.main')}
            description={t(isPublic ? 'bugReporting.public.mainOn' : 'bugReporting.public.mainOff')}
          />
          <PublicSwitch
            checked={acceptReports}
            onChange={setAcceptReports}
            iconOn={MessageSquarePlus}
            title={t('bugReporting.public.form')}
            description={t(
              acceptReports ? 'bugReporting.public.formOn' : 'bugReporting.public.formOff',
            )}
          />
          {acceptReports && !isPublic && (
            <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              {t('bugReporting.public.formNeedsPublic')}
            </p>
          )}
          <TextArea
            label={t('bugReporting.public.intro')}
            hint={t('bugReporting.public.introHint')}
            rows={3}
            maxLength={2000}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
          />
        </div>
      </Section>
      <p className="flex items-start gap-2 rounded-xl bg-info-soft p-4 text-sm text-info">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t('bugReporting.public.privacy')}
      </p>
      <PublicFieldChecklist groups={['bugs']} fields={effective} onToggle={toggle} />
      <FormAlert message={save.isError ? apiErrorText(t, save.error) : null} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {settings.is_public ? (
          <Link
            to={publicUrl}
            target="_blank"
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {t('workshop.public.preview')}
          </Link>
        ) : (
          <span />
        )}
        <Button
          icon={Save}
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate()}
        >
          {t('workshop.public.save')}
        </Button>
      </div>
    </div>
  )
}
