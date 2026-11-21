import {
  DEFECT_IMPORT_FIELDS,
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  EMPTY_LABEL,
  suggestDefectMapping,
  type DefectImportConfigInput,
  type DefectImportField,
  type DefectSourceKind,
  type ImportJobDto,
  type ImportSheetInfo,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bug, CheckCheck, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { useToast } from '../components/ui/toast-context'
import { useCycles } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { useDataSource } from '../services/use-data-source'
import { RowsList } from './ImportJobPage'
import { ImportStatusBadge } from './ImportsPage'

interface DraftSheet {
  name: string
  include: boolean
  header_row: number
  module_code: string
  source_kind: DefectSourceKind
  mapping: (DefectImportField | null)[]
}
interface Draft {
  sheets: DraftSheet[]
  cycle_id: string
  link_results: boolean
  status_map: Record<string, string>
  severity_map: Record<string, string>
  priority_map: Record<string, string>
}

const headerOf = (info: ImportSheetInfo, row: number) => info.top_rows[row - 1] ?? []
const CONTROL =
  'min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm focus:border-brand-600'

function initialDraft(job: ImportJobDto): Draft {
  const config = job.defect_config
  return {
    sheets: job.sheets.map((info) => {
      const saved = config?.sheets.find((s) => s.name === info.name)
      const headerRow = saved?.header_row ?? info.suggested_header_row ?? 1
      return {
        name: info.name,
        // Hidden sheets are usually copies; they start unticked.
        include: saved ? true : !config && !info.hidden && info.suggested_header_row !== null,
        header_row: headerRow,
        module_code: saved?.module_code ?? info.suggested_module_code,
        source_kind:
          saved?.source_kind ??
          (/aduan|keluhan|complaint/i.test(info.name) ? 'USER_REPORT' : 'UAT'),
        mapping: saved?.mapping ?? suggestDefectMapping(headerOf(info, headerRow)),
      }
    }),
    cycle_id: config?.cycle_id ?? '',
    link_results: config?.link_results ?? true,
    status_map: { ...(config?.status_map ?? {}) },
    severity_map: { ...(config?.severity_map ?? {}) },
    priority_map: { ...(config?.priority_map ?? {}) },
  }
}

const clean = <T extends string>(map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).filter(([, v]) => v !== '')) as Record<string, T>

function toConfig(draft: Draft): DefectImportConfigInput {
  return {
    sheets: draft.sheets
      .filter((s) => s.include)
      .map((s) => ({
        name: s.name,
        header_row: s.header_row,
        mapping: s.mapping,
        module_code: s.module_code.trim() || undefined,
        source_kind: s.source_kind,
      })),
    cycle_id: draft.cycle_id || null,
    link_results: draft.link_results,
    status_map: clean(draft.status_map),
    severity_map: clean(draft.severity_map),
    priority_map: clean(draft.priority_map),
  }
}

function SheetCard({
  info,
  sheet,
  onChange,
}: {
  info: ImportSheetInfo
  sheet: DraftSheet
  onChange: (patch: Partial<DraftSheet>) => void
}) {
  const { t } = useTranslation()
  const header = headerOf(info, sheet.header_row)
  return (
    <li
      className={`rounded-xl border p-4 ${sheet.include ? 'border-brand-200 bg-surface' : 'border-line bg-canvas'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-4.5 accent-brand-700"
            checked={sheet.include}
            onChange={(e) => onChange({ include: e.target.checked })}
            aria-label={t('pages.importJob.include', { name: info.name })}
          />
          <span className="font-semibold">{info.name}</span>
        </label>
        {info.hidden && <Badge tone="muted" label={t('pages.importJob.hidden')} />}
        <span className="text-xs text-ink-muted">
          {t('pages.importJob.rows', { count: info.row_count })}
          {info.image_count > 0 && ` · ${t('pages.importJob.images', { count: info.image_count })}`}
        </span>
      </div>
      {sheet.include && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              type="number"
              min={1}
              max={30}
              label={t('pages.importJob.headerRow')}
              required
              value={sheet.header_row}
              onChange={(e) => {
                const row = Math.max(1, Number(e.target.value) || 1)
                onChange({ header_row: row, mapping: suggestDefectMapping(headerOf(info, row)) })
              }}
            />
            <TextField
              label={t('fields.module')}
              hint={t('defectImport.moduleHint')}
              value={sheet.module_code}
              maxLength={40}
              onChange={(e) => onChange({ module_code: e.target.value.toUpperCase() })}
            />
            <SelectField
              label={t('defectImport.sourceKind')}
              value={sheet.source_kind}
              onChange={(e) => onChange({ source_kind: e.target.value as DefectSourceKind })}
              options={(['UAT', 'USER_REPORT', 'OTHER'] as const).map((s) => ({
                value: s,
                label: t(`codes.defectSource.${s}`),
              }))}
            />
          </div>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              {t('defectImport.mapping', {
                count: sheet.mapping.filter(Boolean).length,
              })}
            </summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {header.map((cell, col) =>
                cell.trim() ? (
                  <li key={col} className="flex items-center gap-2 text-sm">
                    <span className="w-2/5 truncate text-ink-muted" title={cell}>
                      {cell}
                    </span>
                    <select
                      className={CONTROL}
                      aria-label={t('defectImport.columnFor', { column: cell })}
                      value={sheet.mapping[col] ?? ''}
                      onChange={(e) => {
                        const next = [...sheet.mapping]
                        next[col] = (e.target.value || null) as DefectImportField | null
                        onChange({ mapping: next })
                      }}
                    >
                      <option value="">{t('defectImport.notUsed')}</option>
                      {DEFECT_IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {t(`defectImport.fields.${field}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                ) : null,
              )}
            </ul>
          </details>
        </div>
      )}
    </li>
  )
}

function ValueMap({
  title,
  rows,
  value,
  options,
  onChange,
}: {
  title: string
  rows: { label: string; count: number; mapped: string | null }[]
  value: Record<string, string>
  options: { value: string; label: string }[]
  onChange: (label: string, next: string) => void
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            <span className="w-2/5 truncate">
              {row.label === EMPTY_LABEL ? t('defectImport.empty') : row.label}{' '}
              <span className="text-xs text-ink-muted">×{row.count}</span>
            </span>
            <select
              className={CONTROL}
              aria-label={`${title}: ${row.label || t('defectImport.empty')}`}
              value={value[row.label] ?? row.mapped ?? ''}
              onChange={(e) => onChange(row.label, e.target.value)}
            >
              {!row.mapped && <option value="">{t('defectImport.unknown')}</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

/** "Impor Bug" wizard (ADR 0013): sheets -> check -> value maps -> apply. */
export function DefectImportJob({ job }: { job: ImportJobDto }) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const cycles = useCycles(code)
  const [draft, setDraft] = useState<Draft>(() => initialDraft(job))
  const [stale, setStale] = useState(job.status_code === 'UPLOADED')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'apply' | 'cancel' | null>(null)
  const editable = job.status_code === 'UPLOADED' || job.status_code === 'PREVIEW'
  const done = ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.status_code)
  const preview = job.defect_preview
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setStale(true)
  }

  const previous = useRef(job.status_code)
  useEffect(() => {
    if (previous.current === 'IMPORTING' && job.status_code !== 'IMPORTING') {
      for (const key of ['defects', 'defect', 'dashboard', 'modules', 'import-rows', 'imports']) {
        void queryClient.invalidateQueries({ queryKey: [key, code] })
      }
    }
    previous.current = job.status_code
  }, [job.status_code, code, queryClient])

  const check = useMutation({
    mutationFn: () => ds.configureDefectImport(code, job.id, toConfig(draft)),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['import', code, job.id], updated)
      await queryClient.invalidateQueries({ queryKey: ['import-rows', code, job.id] })
      setStale(false)
      setError(null)
    },
    onError: (err) => setError(apiErrorText(t, err)),
  })
  const apply = useMutation({
    mutationFn: () => ds.commitImport(code, job.id),
    onSuccess: (updated) => {
      setConfirm(null)
      queryClient.setQueryData(['import', code, job.id], updated)
    },
    onError: (err) => {
      setConfirm(null)
      setError(apiErrorText(t, err))
    },
  })
  const cancel = useMutation({
    mutationFn: () => ds.deleteImport(code, job.id),
    onSuccess: async () => {
      toast.show(t('pages.importJob.cancelled'))
      await queryClient.invalidateQueries({ queryKey: ['imports', code] })
      navigate(projectPath(code, 'imports'))
    },
    onError: (err) => {
      setConfirm(null)
      setError(apiErrorText(t, err))
    },
  })

  const statusOptions = [
    ...DEFECT_STATUSES.map((s) => ({ value: s, label: t(`codes.defectStatus.${s}`) })),
    { value: 'SKIP', label: t('defectImport.skip') },
  ]
  const result = job.defect_result

  return (
    <>
      <PageHeader
        title={job.original_filename}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.imports.title'), to: projectPath(code, 'imports') },
          { label: job.original_filename },
        ]}
        badges={
          <>
            <Badge tone="brand" icon={Bug} label={t('pages.imports.target.DEFECTS')} />
            <Badge tone="muted" label={job.source_format} />
            <ImportStatusBadge status={job.status_code} />
          </>
        }
      />
      <div className="space-y-6">
        {job.status_code === 'IMPORTING' && (
          <p
            className="flex items-center gap-2 rounded-xl border border-info/20 bg-info-soft p-4 text-sm text-info"
            aria-live="polite"
          >
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            {t('pages.importJob.applying')}
          </p>
        )}

        {done && (
          <Section>
            <div className="space-y-2 text-sm" aria-live="polite">
              <p className="font-semibold">
                {t(`pages.importJob.done.${job.status_code as 'COMPLETED'}`)}
              </p>
              {job.failure && (
                <p className="text-danger">
                  {t(`pages.importJob.failure.${job.failure}`, { defaultValue: job.failure })}
                </p>
              )}
              {result && (
                <>
                  <p>
                    {t('defectImport.summary', {
                      created: result.created_defects,
                      skipped: result.skipped_rows,
                      linked: result.linked_results,
                      images: result.images_imported,
                    })}
                  </p>
                  <ButtonLink to={projectPath(code, 'bugs')} icon={Bug}>
                    {t('defectImport.openBugs')}
                  </ButtonLink>
                </>
              )}
            </div>
          </Section>
        )}

        {editable && (
          <>
            <Section title={t('pages.importJob.sheets')} description={t('defectImport.sheetsHint')}>
              <ul className="space-y-3">
                {job.sheets.map((info, index) => (
                  <SheetCard
                    key={info.name}
                    info={info}
                    sheet={draft.sheets[index] as DraftSheet}
                    onChange={(patch) =>
                      update({
                        sheets: draft.sheets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
                      })
                    }
                  />
                ))}
              </ul>
            </Section>
            <Section title={t('defectImport.settings')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t('fields.cycle')}
                  hint={t('defectImport.cycleHint')}
                  value={draft.cycle_id}
                  onChange={(e) => update({ cycle_id: e.target.value })}
                  options={[
                    { value: '', label: t('pages.bugForm.noCycle') },
                    ...(cycles.data ?? []).map((cy) => ({
                      value: cy.id,
                      label: `${cy.cycle_code} - ${cy.title}`,
                    })),
                  ]}
                />
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4.5 accent-brand-700"
                    checked={draft.link_results}
                    onChange={(e) => update({ link_results: e.target.checked })}
                  />
                  <span>
                    <span className="block font-semibold">{t('defectImport.linkResults')}</span>
                    <span className="block text-xs text-ink-muted">
                      {t('defectImport.linkResultsHint')}
                    </span>
                  </span>
                </label>
              </div>
              <FormAlert message={error} />
              <div className="mt-4 flex justify-end">
                <Button
                  icon={RefreshCw}
                  variant={preview && !stale ? 'secondary' : 'primary'}
                  loading={check.isPending}
                  disabled={!draft.sheets.some((s) => s.include)}
                  onClick={() => check.mutate()}
                >
                  {preview ? t('defectImport.recheck') : t('defectImport.check')}
                </Button>
              </div>
            </Section>

            {preview && (
              <Section title={t('pages.importJob.preview')}>
                <div className="space-y-5">
                  {stale && (
                    <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
                      {t('defectImport.stale')}
                    </p>
                  )}
                  <p className="text-sm">
                    {t('defectImport.counts', {
                      create: preview.counts.create,
                      skipped: preview.counts.skipped,
                      duplicate: preview.counts.duplicate,
                      invalid: preview.counts.invalid,
                    })}
                    {preview.images.total > 0 &&
                      ` · ${t('defectImport.imageCount', { auto: preview.images.auto, total: preview.images.total })}`}
                  </p>
                  {preview.new_modules.length > 0 && (
                    <p className="text-xs text-ink-muted">
                      {t('pages.importJob.newModules', { list: preview.new_modules.join(', ') })}
                    </p>
                  )}
                  <ValueMap
                    title={t('defectImport.statusMap')}
                    rows={preview.statuses}
                    value={draft.status_map}
                    options={statusOptions}
                    onChange={(label, next) =>
                      update({ status_map: { ...draft.status_map, [label]: next } })
                    }
                  />
                  <ValueMap
                    title={t('defectImport.severityMap')}
                    rows={preview.severities}
                    value={draft.severity_map}
                    options={DEFECT_SEVERITIES.map((s) => ({
                      value: s,
                      label: t(`codes.severity.${s}`),
                    }))}
                    onChange={(label, next) =>
                      update({ severity_map: { ...draft.severity_map, [label]: next } })
                    }
                  />
                  <ValueMap
                    title={t('defectImport.priorityMap')}
                    rows={preview.priorities}
                    value={draft.priority_map}
                    options={DEFECT_PRIORITIES.map((p) => ({
                      value: p,
                      label: t(`codes.defectPriority.${p}`),
                    }))}
                    onChange={(label, next) =>
                      update({ priority_map: { ...draft.priority_map, [label]: next } })
                    }
                  />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" icon={Trash2} onClick={() => setConfirm('cancel')}>
                      {t('pages.importJob.cancel')}
                    </Button>
                    <Button
                      icon={CheckCheck}
                      disabled={stale || preview.counts.create === 0}
                      onClick={() => setConfirm('apply')}
                    >
                      {t('pages.importJob.apply')}
                    </Button>
                  </div>
                </div>
              </Section>
            )}
          </>
        )}

        {(preview || done) && <RowsList code={code} job={job} />}
      </div>

      <ConfirmDialog
        open={confirm === 'apply'}
        title={t('pages.importJob.applyTitle', { name: job.original_filename })}
        body={t('defectImport.applyBody', { count: preview?.counts.create ?? 0 })}
        confirmLabel={t('pages.importJob.apply')}
        tone="primary"
        busy={apply.isPending}
        onConfirm={() => apply.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={t('pages.importJob.cancelTitle', { name: job.original_filename })}
        body={t('pages.importJob.cancelBody')}
        confirmLabel={t('pages.importJob.cancel')}
        busy={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
