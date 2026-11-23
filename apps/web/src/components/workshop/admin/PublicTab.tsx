import {
  normalizePublicFields,
  PUBLIC_FIELD_GROUPS,
  PUBLIC_FIELD_REQUIRES,
  type PublicField,
  type WorkshopBoardDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleHelp, ExternalLink, Eye, Globe, Lock, Save, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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

/**
 * "Tampilkan secara publik": one main switch for the Fase plus a switch for every piece of
 * data. Everything starts hidden; the public page only receives what is switched on.
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
  const [isPublic, setIsPublic] = useState(board.cycle.is_public)
  const [fields, setFields] = useState<PublicField[]>(board.cycle.public_fields)
  const [intro, setIntro] = useState(board.cycle.public_intro ?? '')
  const effective = normalizePublicFields(fields)
  // Opens the public page as visitors would see it, with the choices on screen (even unsaved).
  const previewUrl = `/publik/${board.cycle.id}?pratinjau=1&data=${effective.join(',')}`
  const save = useMutation({
    mutationFn: () =>
      ds.updateCyclePublic(code, board.cycle.id, {
        is_public: isPublic,
        public_fields: effective,
        public_intro: intro.trim() || null,
      }),
    onSuccess: async (saved) => {
      setFields(saved.public_fields)
      await queryClient.invalidateQueries({ queryKey: ['workshop-board', code, board.cycle.id] })
      await queryClient.invalidateQueries({ queryKey: ['public'] })
      await queryClient.invalidateQueries({ queryKey: ['cycles', code] })
      toast.show(t(saved.is_public ? 'workshop.public.savedOn' : 'workshop.public.savedOff'))
    },
  })
  const toggle = (field: PublicField) =>
    setFields((list) => (list.includes(field) ? list.filter((f) => f !== field) : [...list, field]))
  const dirty =
    isPublic !== board.cycle.is_public ||
    (intro.trim() || null) !== board.cycle.public_intro ||
    effective.join() !== board.cycle.public_fields.join()

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="cara-publik"
        className="rounded-xl border-2 border-brand-200 bg-brand-50/60 p-5"
      >
        <h2 id="cara-publik" className="text-lg font-semibold">
          {t('workshop.public.howTitle')}
        </h2>
        <ol className="mt-3 space-y-2">
          {(['step1', 'step2', 'step3', 'step4'] as const).map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5">{t(`workshop.public.how.${step}`)}</span>
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
            {t('workshop.public.previewButton')}
          </Link>
          <Link
            to="/panduan#publik"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <CircleHelp aria-hidden="true" className="size-4" />
            {t('workshop.public.guideLink')}
          </Link>
        </div>
      </section>

      <Section title={t('workshop.public.mainTitle')}>
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={isPublic}
            disabled={!canManage}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span
            aria-hidden="true"
            className="relative mt-1 inline-flex h-8 w-14 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-success peer-focus-visible:ring-4 peer-focus-visible:ring-brand-300 after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-6"
          />
          <span>
            <span className="flex items-center gap-2 text-lg font-semibold">
              {isPublic ? (
                <Globe aria-hidden="true" className="size-5 text-success" />
              ) : (
                <Lock aria-hidden="true" className="size-5 text-ink-muted" />
              )}
              {t('workshop.public.main')}
            </span>
            <span className="block text-sm text-ink-muted">
              {t(isPublic ? 'workshop.public.mainOn' : 'workshop.public.mainOff')}
            </span>
          </span>
        </label>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PUBLIC_FIELD_GROUPS.map((group) => (
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
                        disabled={!canManage || blocked}
                        onChange={() => toggle(field)}
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

      <FormAlert message={save.isError ? apiErrorText(t, save.error) : null} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {board.cycle.is_public ? (
          <Link
            to={`/publik/${board.cycle.id}`}
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
