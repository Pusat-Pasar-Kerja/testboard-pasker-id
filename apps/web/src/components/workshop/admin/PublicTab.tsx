import {
  normalizePublicFields,
  PUBLIC_FIELD_GROUPS,
  PUBLIC_FIELD_REQUIRES,
  type PublicField,
  type PublicFieldGroup,
  type WorkshopBoardDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bug, CircleHelp, ExternalLink, Eye, Globe, Lock, Save, ShieldAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { projectPath } from '../../../hooks/route-state'
import { invalidateStructure } from '../../../hooks/structure-queries'
import { apiErrorText } from '../../../lib/api-errors'
import { useDataSource } from '../../../services/use-data-source'
import { Button } from '../../ui/Button'
import { FormAlert, TextArea } from '../../ui/Form'
import { Section } from '../../ui/Section'
import { useToast } from '../../ui/toast-context'

/** Fields that may show personal data or screenshots: switched on with care. */
const SENSITIVE: PublicField[] = [
  'features.members',
  'bugs.description',
  'bugs.reporter',
  'bugs.evidence',
]

/** A big ON/OFF switch with a title and a sentence on what it does. */
export function PublicSwitch({
  checked,
  disabled,
  onChange,
  title,
  description,
  iconOn = Globe,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
  iconOn?: typeof Globe
}) {
  const IconOn = iconOn
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-1 inline-flex h-8 w-14 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-success peer-focus-visible:ring-4 peer-focus-visible:ring-brand-300 after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6"
      />
      <span>
        <span className="flex items-center gap-2 text-lg font-semibold">
          {checked ? (
            <IconOn aria-hidden="true" className="size-5 text-success" />
          ) : (
            <Lock aria-hidden="true" className="size-5 text-ink-muted" />
          )}
          {title}
        </span>
        <span className="block text-sm text-ink-muted">{description}</span>
      </span>
    </label>
  )
}

/** The switch for every piece of public data, grouped; a field waits for the one it needs. */
export function PublicFieldChecklist({
  groups,
  fields,
  disabled,
  onToggle,
}: {
  groups: PublicFieldGroup[]
  fields: PublicField[]
  disabled?: boolean
  onToggle: (field: PublicField) => void
}) {
  const { t } = useTranslation()
  const effective = normalizePublicFields(fields)
  const shown = PUBLIC_FIELD_GROUPS.filter((g) => groups.includes(g.group))
  return (
    <div className={`grid grid-cols-1 gap-6 ${shown.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {shown.map((group) => (
        <Section key={group.group} title={t(`workshop.public.group.${group.group}`)}>
          <ul className="space-y-3">
            {group.fields.map((field) => {
              const base = PUBLIC_FIELD_REQUIRES[field]
              const blocked = base ? !effective.includes(base) : false
              const on = effective.includes(field)
              return (
                <li key={field}>
                  <label
                    className={`flex items-start gap-3 ${blocked ? 'opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-brand-700"
                      checked={on}
                      disabled={disabled || blocked}
                      onChange={() => onToggle(field)}
                    />
                    <span>
                      <span className="block font-medium">
                        {t(`workshop.public.field.${field}.label`)}
                        {SENSITIVE.includes(field) && (
                          <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">
                            {t('workshop.public.sensitive')}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-ink-muted">
                        {t(`workshop.public.field.${field}.hint`)}
                      </span>
                      {blocked && base && (
                        <span className="block text-xs text-ink-muted">
                          {t('workshop.public.needs', {
                            field: t(`workshop.public.field.${base}.label`),
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </Section>
      ))}
    </div>
  )
}

/** The numbered "how it works" box at the top of a public-view tab. */
export function PublicHowTo({
  title,
  steps,
  previewUrl,
  previewLabel,
  extra,
}: {
  title: string
  steps: string[]
  previewUrl: string
  previewLabel: string
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={title} className="rounded-xl border-2 border-brand-200 bg-brand-50/60 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={previewUrl}
          target="_blank"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          <Eye aria-hidden="true" className="size-4" />
          {previewLabel}
        </Link>
        <Link
          to="/panduan#publik"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
          {t('workshop.public.guideLink')}
        </Link>
        {extra}
      </div>
    </section>
  )
}

/**
 * "Tampilkan secara publik" for one UAT: a main switch plus a switch for every piece of
 * data. Everything starts hidden. Problems are shown through Bug Reporting (ADR 0019).
 */
export function PublicTab({
  code,
  board,
  canManage,
}: {
  code: string
  board: WorkshopBoardDto
  canManage: boolean
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const uat = board.uat
  const [isPublic, setIsPublic] = useState(uat.is_public)
  const [fields, setFields] = useState<PublicField[]>(
    uat.public_fields.filter((f) => !f.startsWith('bugs.')),
  )
  const [intro, setIntro] = useState(uat.public_intro ?? '')
  const effective = normalizePublicFields(fields).filter((f) => !f.startsWith('bugs.'))
  // Opens the public page as visitors would see it, with the choices on screen (even unsaved).
  const previewUrl = `/publik/uat/${uat.id}?pratinjau=1&data=${effective.join(',')}`
  const save = useMutation({
    mutationFn: () =>
      ds.updateUatPublic(code, uat.id, {
        is_public: isPublic,
        public_fields: effective,
        public_intro: intro.trim() || null,
      }),
    onSuccess: async (saved) => {
      setFields(saved.public_fields)
      await invalidateStructure(queryClient, code)
      await queryClient.invalidateQueries({ queryKey: ['public'] })
      toast.show(t(saved.is_public ? 'workshop.public.savedOn' : 'workshop.public.savedOff'))
    },
  })
  const toggle = (field: PublicField) =>
    setFields((list) => (list.includes(field) ? list.filter((f) => f !== field) : [...list, field]))
  const dirty =
    isPublic !== uat.is_public ||
    (intro.trim() || null) !== uat.public_intro ||
    effective.join() !== uat.public_fields.filter((f) => !f.startsWith('bugs.')).join()

  return (
    <div className="space-y-6">
      <PublicHowTo
        title={t('workshop.public.howTitle')}
        steps={(['step1', 'step2', 'step3', 'step4'] as const).map((step) =>
          t(`workshop.public.how.${step}`),
        )}
        previewUrl={previewUrl}
        previewLabel={t('workshop.public.previewButton')}
      />

      <Section title={t('workshop.public.mainTitle')}>
        <PublicSwitch
          checked={isPublic}
          disabled={!canManage}
          onChange={setIsPublic}
          title={t('workshop.public.main')}
          description={t(isPublic ? 'workshop.public.mainOn' : 'workshop.public.mainOff')}
        />
        <div className="mt-5">
          <TextArea
            label={t('workshop.public.intro')}
            hint={t('workshop.public.introHint')}
            rows={3}
            maxLength={2000}
            value={intro}
            disabled={!canManage}
            onChange={(e) => setIntro(e.target.value)}
          />
        </div>
      </Section>

      <p className="flex items-start gap-2 rounded-xl bg-info-soft p-4 text-sm text-info">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t('workshop.public.privacy')}
      </p>

      <PublicFieldChecklist
        groups={['cycle', 'features']}
        fields={effective}
        disabled={!canManage}
        onToggle={toggle}
      />

      <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4 text-sm">
        <Bug aria-hidden="true" className="size-5 shrink-0 text-brand-700" />
        <span>{t('uat.public.bugsElsewhere')}</span>
        <Link
          to={`${projectPath(code, 'bugs')}?tab=publik`}
          className="font-semibold text-brand-700 hover:underline"
        >
          {t('uat.public.bugsLink')}
        </Link>
      </p>

      <FormAlert message={save.isError ? apiErrorText(t, save.error) : null} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {uat.is_public ? (
          <Link
            to={`/publik/uat/${uat.id}`}
            target="_blank"
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700 hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {t('workshop.public.preview')}
          </Link>
        ) : (
          <Link
            to={previewUrl}
            target="_blank"
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700 hover:underline"
          >
            <Eye aria-hidden="true" className="size-4" />
            {t('workshop.public.previewButton')}
          </Link>
        )}
        {canManage && (
          <Button
            icon={Save}
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => save.mutate()}
          >
            {t('workshop.public.save')}
          </Button>
        )}
      </div>
    </div>
  )
}
