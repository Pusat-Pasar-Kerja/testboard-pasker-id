import {
  CODE_CONFLICT_DECISIONS,
  type CodeConflictDecision,
  CASE_IMPORT_FIELDS,
  EXECUTION_STATUSES,
  IMPORT_MODES,
  RESULT_IMPORT_FIELDS,
  suggestMapping,
  type ImportConfigInput,
  type ImportField,
  type ImportJobDto,
  type ImportMode,
  type ImportRowDto,
  type ImportSheetInfo,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Download, Info, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { StatTile } from '../components/charts/StatTile'
import { ExecutionStatusBadge } from '../components/status/StatusBadges'
import { Badge, type Tone } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCycles, useImport, useImportRows } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { ApiClientError } from '../services/api-client'
import type { ImportRowQuery } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { ImportStatusBadge } from './ImportsPage'
import { DefectImportJob } from './DefectImportJob'
import { NotFoundPage } from './NotFoundPage'

interface DraftSheet {
  name: string
  include: boolean
  header_row: number
  mapping: (ImportField | null)[]
  module_code: string
  suite_name: string
  reference_document: string | null
  reference_version: string | null
}

interface Draft {
  sheets: DraftSheet[]
  import_mode: ImportMode
  case_status: 'DRAFT' | 'READY'
  include_results: boolean
  run: { name: string; environment_name: string; build_version: string; cycle_id: string }
  status_map: Record<string, string>
  image_rows: Record<string, number | null>
  code_conflict: CodeConflictDecision
  conflict_rows: Record<string, CodeConflictDecision>
}

const headerOf = (info: ImportSheetInfo | undefined, row: number) => info?.top_rows[row - 1] ?? []

function initialDraft(job: ImportJobDto): Draft {
  const config = job.config
  const legacy = job.source_format === 'XLSX'
  return {
    sheets: job.sheets.map((info) => {
      const saved = config?.sheets.find((s) => s.name === info.name)
      const headerRow = saved?.header_row ?? info.suggested_header_row ?? 1
      return {
        name: info.name,
        include: saved
          ? true
          : config
            ? false
            : !legacy || (!info.hidden && info.suggested_header_row !== null),
        header_row: headerRow,
        mapping: saved?.mapping ?? suggestMapping(headerOf(info, headerRow)),
        module_code: saved?.module_code ?? (legacy ? info.suggested_module_code : ''),
        suite_name: saved?.suite_name ?? (legacy ? info.name : ''),
        reference_document: saved?.reference_document ?? info.reference_document,
        reference_version: saved?.reference_version ?? info.reference_version,
      }
    }),
    import_mode: config?.import_mode ?? 'CREATE_ONLY',
    case_status: config?.case_status ?? 'DRAFT',
    include_results: config?.include_results ?? false,
    run: {
      name:
        config?.run?.name ??
        `Migrasi ${job.original_filename.replace(/\.[^.]+$/, '')}`.slice(0, 255),
      environment_name: config?.run?.environment_name ?? '',
      build_version: config?.run?.build_version ?? '',
      cycle_id: config?.run?.cycle_id ?? '',
    },
    status_map: { ...(config?.status_map ?? {}) },
    image_rows: { ...(config?.image_rows ?? {}) },
    code_conflict: config?.code_conflict ?? 'SKIP',
    conflict_rows: { ...(config?.conflict_rows ?? {}) },
  }
}

function toConfig(draft: Draft): ImportConfigInput {
  return {
    sheets: draft.sheets
      .filter((s) => s.include)
      .map((s) => ({
        name: s.name,
        header_row: s.header_row,
        mapping: s.mapping,
        module_code: s.module_code.trim() || undefined,
        suite_name: s.suite_name.trim() || undefined,
        reference_document: s.reference_document,
        reference_version: s.reference_version,
      })),
    import_mode: draft.import_mode,
    case_status: draft.case_status,
    include_results: draft.include_results,
    run: draft.include_results
      ? {
          name: draft.run.name.trim() || 'Migrasi UAT',
          environment_name: draft.run.environment_name.trim() || null,
          build_version: draft.run.build_version.trim() || null,
          cycle_id: draft.run.cycle_id || null,
        }
      : undefined,
    status_map: Object.fromEntries(
      Object.entries(draft.status_map).filter(([, v]) => v !== ''),
    ) as ImportConfigInput['status_map'],
    image_rows: draft.image_rows,
    code_conflict: draft.code_conflict,
    conflict_rows: draft.conflict_rows,
  }
}

const ROW_TONE: Record<ImportRowDto['status_code'], Tone> = {
  PENDING: 'neutral',
  VALID: 'brand',
  ERROR: 'danger',
  DUPLICATE: 'warning',
  IMPORTED: 'success',
  SKIPPED: 'muted',
}

const CONTROL =
  'min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand-500'

function SheetCard({
  info,
  sheet,
  single,
  onChange,
  disabled,
}: {
  info: ImportSheetInfo
  sheet: DraftSheet
  single: boolean
  onChange: (patch: Partial<DraftSheet>) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const header = headerOf(info, sheet.header_row)
  const sample = info.top_rows[sheet.header_row] ?? []
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
            disabled={disabled || single}
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
      {info.reference_document && (
        <p className="mt-1 text-xs text-ink-muted">
          {t('pages.importJob.reference', { doc: info.reference_document })}
          {info.reference_version &&
            `, ${t('pages.importJob.referenceVersion', { version: info.reference_version })}`}
        </p>
      )}
      {sheet.include && (
        <div className="mt-3 space-y-3">
          {info.suggested_header_row === null && (
            <p className="text-xs font-medium text-warning">{t('pages.importJob.noHeader')}</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField
              type="number"
              min={1}
              max={30}
              label={t('pages.importJob.headerRow')}
              required
              value={sheet.header_row}
              disabled={disabled}
              onChange={(e) => {
                const row = Math.min(30, Math.max(1, Number(e.target.value) || 1))
                onChange({ header_row: row, mapping: suggestMapping(headerOf(info, row)) })
              }}
            />
            <TextField
              label={t('pages.importJob.module')}
              value={sheet.module_code}
              disabled={disabled}
              hint={t('pages.importJob.moduleHint')}
              onChange={(e) => onChange({ module_code: e.target.value.toUpperCase() })}
            />
            <TextField
              label={t('pages.importJob.suite')}
              value={sheet.suite_name}
              disabled={disabled}
              onChange={(e) => onChange({ suite_name: e.target.value })}
            />
          </div>
          <details className="rounded-lg border border-line">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
              {t('pages.importJob.mapping')} ({sheet.mapping.filter(Boolean).length})
            </summary>
            <div className="space-y-2 border-t border-line p-3">
              <p className="text-xs text-ink-muted">{t('pages.importJob.mappingHint')}</p>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {header.map((cell, index) =>
                  cell.trim() ? (
                    <li key={`${index}-${cell}`} className="min-w-0">
                      <label className="block text-xs font-medium">
                        {t('pages.importJob.column', { name: cell })}
                        <select
                          className={`${CONTROL} mt-1`}
                          value={sheet.mapping[index] ?? ''}
                          disabled={disabled}
                          onChange={(e) => {
                            const mapping = [...sheet.mapping]
                            while (mapping.length <= index) mapping.push(null)
                            mapping[index] = (e.target.value || null) as ImportField | null
                            onChange({ mapping })
                          }}
                        >
                          <option value="">{t('pages.importJob.ignore')}</option>
                          <optgroup label={t('pages.importJob.groupCase')}>
                            {CASE_IMPORT_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {t(`importField.${f}`)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={t('pages.importJob.groupResult')}>
                            {RESULT_IMPORT_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {t(`importField.${f}`)}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>
                      {sample[index] && (
                        <p className="mt-0.5 truncate text-xs text-ink-muted" title={sample[index]}>
                          {t('pages.importJob.sample', { value: sample[index] })}
                        </p>
                      )}
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          </details>
        </div>
      )}
    </li>
  )
}

export function RowsList({ code, job }: { code: string; job: ImportJobDto }) {
  const { t } = useTranslation()
  const done = ['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.status_code)
  type TabId = 'all' | 'ok' | 'review' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'SKIPPED'
  const tabs: { id: TabId; status?: ImportRowQuery['status'] }[] = done
    ? [
        { id: 'all' },
        { id: 'IMPORTED', status: 'IMPORTED' },
        { id: 'SKIPPED', status: 'SKIPPED' },
        { id: 'ERROR', status: 'ERROR' },
      ]
    : [
        { id: 'all' },
        { id: 'ok', status: 'ok' },
        { id: 'review', status: 'review' },
        { id: 'DUPLICATE', status: 'DUPLICATE' },
        { id: 'ERROR', status: 'ERROR' },
      ]
  const [tab, setTab] = useState<TabId>('all')
  const [page, setPage] = useState(1)
  const rows = useImportRows(code, job.id, { status: tabs.find((x) => x.id === tab)?.status, page })

  const issueText = (row: ImportRowDto) => [
    ...row.issues.map(
      (i) =>
        `${i.field ? `${t(`importField.${i.field}`)}: ` : ''}${t(`importIssue.${i.code}`, { defaultValue: i.code })}${
          i.value ? ` (${i.value})` : ''
        }`,
    ),
    ...(row.duplicate_of
      ? [
          row.duplicate_of === 'EXISTING'
            ? t('pages.importJob.duplicateExisting')
            : t('pages.importJob.duplicateOf', { ref: row.duplicate_of }),
        ]
      : []),
  ]

  return (
    <Section title={t('pages.importJob.row')}>
      <div role="tablist" className="-mx-1 mb-3 flex flex-wrap gap-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => {
              setTab(x.id)
              setPage(1)
            }}
            className={`min-h-10 rounded-lg px-3 text-sm font-medium ${
              tab === x.id ? 'bg-brand-50 text-brand-800' : 'text-ink-muted hover:bg-neutral-soft'
            }`}
          >
            {t(`pages.importJob.tabs.${x.id}`)}
          </button>
        ))}
      </div>
      {rows.isPending && <LoadingState rows={3} />}
      {rows.isError && <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />}
      {rows.isSuccess && rows.data.total === 0 && <EmptyState filtered description="-" />}
      {rows.isSuccess && rows.data.total > 0 && (
        <>
          <ul className="divide-y divide-line" aria-label={t('pages.importJob.row')}>
            {rows.data.data.map((row) => {
              const issues = issueText(row)
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-1 py-2.5 text-sm md:grid-cols-[9rem_minmax(0,1fr)_auto]"
                >
                  <span className="text-xs text-ink-muted tabular-nums">
                    {row.sheet_name}!{row.source_row_number}
                    {row.external_case_code && (
                      <span className="block font-semibold text-brand-700">
                        {row.external_case_code}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words">{row.title ?? '-'}</span>
                    {issues.length > 0 && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {issues.join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-start gap-1.5 md:justify-end">
                    <Badge
                      tone={ROW_TONE[row.status_code]}
                      label={t(`codes.importRowStatus.${row.status_code}`)}
                    />
                    {row.action && (
                      <Badge tone="muted" label={t(`codes.importAction.${row.action}`)} />
                    )}
                    {row.result_status && <ExecutionStatusBadge status={row.result_status} />}
                    {row.image_count > 0 && (
                      <Badge
                        tone="info"
                        label={t('pages.importJob.images', { count: row.image_count })}
                      />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <Pagination
            page={rows.data.page}
            pageSize={rows.data.page_size}
            total={rows.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </Section>
  )
}

function ImportJob({ job }: { job: ImportJobDto }) {
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
  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setStale(true)
  }

  // When a background import finishes, everything it touched is refreshed.
  const previous = useRef(job.status_code)
  useEffect(() => {
    if (previous.current === 'IMPORTING' && job.status_code !== 'IMPORTING') {
      for (const key of [
        'test-cases',
        'runs',
        'run',
        'dashboard',
        'modules',
        'suites',
        'files',
        'import-rows',
        'imports',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key, code] })
      }
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
    previous.current = job.status_code
  }, [job.status_code, code, queryClient])

  const check = useMutation({
    mutationFn: () => ds.configureImport(code, job.id, toConfig(draft)),
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

  const preview = job.preview
  const done =
    job.status_code === 'COMPLETED' || job.status_code === 'PARTIAL' || job.status_code === 'FAILED'
  const included = draft.sheets.some((s) => s.include)

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
              {job.result && (
                <>
                  <p>
                    {t('pages.importJob.summary', {
                      created: job.result.created_cases,
                      updated: job.result.updated_cases,
                      unchanged: job.result.unchanged_cases,
                      skipped: job.result.skipped_rows,
                    })}
                    {job.invalid_rows > 0 &&
                      ` · ${t('pages.importJob.summaryInvalid', { count: job.invalid_rows })}`}
                  </p>
                  {job.result.run && (
                    <p>
                      {t('pages.importJob.summaryRun', {
                        code: job.result.run.run_code,
                        executions: job.result.executions,
                        images: job.result.images_imported,
                      })}
                      {job.result.images_left_out + job.result.images_failed > 0 &&
                        ` · ${t('pages.importJob.imagesNotUsed', { count: job.result.images_left_out + job.result.images_failed })}`}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <ButtonLink to={projectPath(code, 'test-cases')} variant="secondary">
                      {t('pages.importJob.openCases')}
                    </ButtonLink>
                    {job.result.run && (
                      <ButtonLink
                        to={projectPath(code, `runs/${job.result.run.id}`)}
                        icon={CheckCheck}
                      >
                        {t('pages.importJob.openRun')}
                      </ButtonLink>
                    )}
                  </div>
                </>
              )}
            </div>
          </Section>
        )}

        {editable && (
          <>
            <Section
              title={t('pages.importJob.sheets')}
              description={t('pages.importJob.sheetsHint')}
            >
              <ul className="space-y-3">
                {job.sheets.map((info, index) => (
                  <SheetCard
                    key={info.name}
                    info={info}
                    sheet={draft.sheets[index] as DraftSheet}
                    single={job.sheets.length === 1}
                    disabled={check.isPending}
                    onChange={(patch) =>
                      update({
                        sheets: draft.sheets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
                      })
                    }
                  />
                ))}
              </ul>
            </Section>

            <Section title={t('pages.importJob.options')}>
              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{t('pages.importJob.mode')}</legend>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {IMPORT_MODES.map((mode) => (
                      <label
                        key={mode}
                        className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${
                          draft.import_mode === mode
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-line'
                        }`}
                      >
                        <input
                          type="radio"
                          name="import-mode"
                          className="mt-0.5 accent-brand-700"
                          checked={draft.import_mode === mode}
                          onChange={() => update({ import_mode: mode })}
                        />
                        <span>
                          <span className="block font-semibold">
                            {t(`codes.importMode.${mode}`)}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {t(`pages.importJob.modeHint.${mode}`)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!draft.include_results && (
                  <SelectField
                    label={t('pages.importJob.caseStatus')}
                    required
                    className="max-w-xs"
                    value={draft.case_status}
                    onChange={(e) =>
                      update({ case_status: e.target.value as Draft['case_status'] })
                    }
                    options={(['DRAFT', 'READY'] as const).map((s) => ({
                      value: s,
                      label: t(`codes.caseStatus.${s}`),
                    }))}
                  />
                )}
                <SelectField
                  label={t('pages.importJob.codeConflict')}
                  hint={t('pages.importJob.codeConflictHint')}
                  className="max-w-md"
                  value={draft.code_conflict}
                  onChange={(e) =>
                    update({
                      code_conflict: e.target.value as CodeConflictDecision,
                      conflict_rows: {},
                    })
                  }
                  options={CODE_CONFLICT_DECISIONS.map((d) => ({
                    value: d,
                    label: t(`pages.importJob.conflictDecision.${d}`),
                  }))}
                />
                <div className="rounded-lg border border-line p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4.5 accent-brand-700"
                      checked={draft.include_results}
                      onChange={(e) => update({ include_results: e.target.checked })}
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {t('pages.importJob.results')}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {t('pages.importJob.resultsHint')}
                      </span>
                    </span>
                  </label>
                  {draft.include_results && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <TextField
                        label={t('pages.importJob.runName')}
                        required
                        value={draft.run.name}
                        onChange={(e) => update({ run: { ...draft.run, name: e.target.value } })}
                      />
                      <TextField
                        label={t('pages.importJob.runEnvironment')}
                        value={draft.run.environment_name}
                        onChange={(e) =>
                          update({ run: { ...draft.run, environment_name: e.target.value } })
                        }
                      />
                      <TextField
                        label={t('pages.importJob.runBuild')}
                        value={draft.run.build_version}
                        onChange={(e) =>
                          update({ run: { ...draft.run, build_version: e.target.value } })
                        }
                      />
                      <SelectField
                        label={t('fields.cycle')}
                        value={draft.run.cycle_id}
                        onChange={(e) =>
                          update({ run: { ...draft.run, cycle_id: e.target.value } })
                        }
                        options={[
                          { value: '', label: t('pages.runForm.noCycle') },
                          ...(cycles.data ?? []).map((cy) => ({
                            value: cy.id,
                            label: `${cy.cycle_code} - ${cy.title}`,
                          })),
                        ]}
                      />
                    </div>
                  )}
                </div>
                <FormAlert message={error} />
                <div className="flex justify-end">
                  <Button
                    icon={RefreshCw}
                    loading={check.isPending}
                    disabled={!included}
                    onClick={() => {
                      setError(null)
                      check.mutate()
                    }}
                  >
                    {t('pages.importJob.check')}
                  </Button>
                </div>
              </div>
            </Section>
          </>
        )}

        {preview && editable && (
          <Section title={t('pages.importJob.preview')}>
            <div className="space-y-5">
              {stale && (
                <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {t('pages.importJob.applyChanges')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {(['create', 'update', 'unchanged', 'review', 'duplicate', 'invalid'] as const).map(
                  (key) => (
                    <StatTile
                      key={key}
                      label={t(`pages.importJob.counts.${key}`)}
                      value={String(preview.counts[key])}
                    />
                  ),
                )}
              </div>
              {preview.counts.total === 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 text-sm text-info">
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {t('pages.importJob.noDataRows')}
                </p>
              )}
              {(preview.new_modules.length > 0 || preview.new_suites.length > 0) && (
                <p className="text-sm text-ink-muted">
                  {preview.new_modules.length > 0 &&
                    t('pages.importJob.newModules', { list: preview.new_modules.join(', ') })}
                  {preview.new_modules.length > 0 && preview.new_suites.length > 0 && ' · '}
                  {preview.new_suites.length > 0 &&
                    t('pages.importJob.newSuites', { list: preview.new_suites.join(', ') })}
                </p>
              )}

              {preview.conflicts.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">
                    {t('pages.importJob.conflicts', { count: preview.conflicts.length })}
                  </legend>
                  <p className="text-xs text-ink-muted">{t('pages.importJob.conflictsHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {CODE_CONFLICT_DECISIONS.map((d) => (
                      <Button
                        key={d}
                        variant="secondary"
                        onClick={() => update({ code_conflict: d, conflict_rows: {} })}
                      >
                        {t(`pages.importJob.conflictAll.${d}`)}
                      </Button>
                    ))}
                  </div>
                  <ul className="max-h-96 space-y-2 overflow-y-auto">
                    {preview.conflicts.map((conflict) => (
                      <li
                        key={conflict.key}
                        className="grid gap-2 rounded-lg border border-line p-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem] md:items-center"
                      >
                        <span className="min-w-0">
                          <span className="block font-mono text-xs text-brand-700">
                            {conflict.code} · {conflict.sheet}!{conflict.row}
                          </span>
                          <span className="block break-words">{conflict.title}</span>
                        </span>
                        <span className="min-w-0 text-ink-muted">
                          <span className="block text-xs">
                            {t(`pages.importJob.conflictOther.${conflict.other}`)}
                          </span>
                          <span className="block break-words">{conflict.other_title}</span>
                        </span>
                        <select
                          className={CONTROL}
                          aria-label={t('pages.importJob.conflictFor', {
                            code: conflict.code,
                            row: conflict.key,
                          })}
                          value={draft.conflict_rows[conflict.key] ?? conflict.decision}
                          onChange={(e) =>
                            update({
                              conflict_rows: {
                                ...draft.conflict_rows,
                                [conflict.key]: e.target.value as CodeConflictDecision,
                              },
                            })
                          }
                        >
                          {CODE_CONFLICT_DECISIONS.map((d) => (
                            <option key={d} value={d}>
                              {t(`pages.importJob.conflictDecision.${d}`)}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              {preview.statuses.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">
                    {t('pages.importJob.statusMap')}
                  </legend>
                  <p className="text-xs text-ink-muted">{t('pages.importJob.statusMapHint')}</p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {preview.statuses.map((s) => (
                      <label key={s.label} className="block text-xs font-medium">
                        {t('pages.importJob.statusLabel', { label: s.label, count: s.count })}
                        <select
                          className={`${CONTROL} mt-1`}
                          value={draft.status_map[s.label] ?? s.mapped ?? ''}
                          onChange={(e) =>
                            update({
                              status_map: { ...draft.status_map, [s.label]: e.target.value },
                            })
                          }
                        >
                          <option value="">{t('pages.importJob.statusIgnore')}</option>
                          {EXECUTION_STATUSES.filter((x) => x !== 'IN_PROGRESS').map((x) => (
                            <option key={x} value={x}>
                              {t(`codes.execution.${x}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {preview.images.total > 0 && (
                <div className="space-y-2">
                  <p className="text-sm">
                    {t('pages.importJob.imagesAuto', { count: preview.images.auto })}
                  </p>
                  {preview.images.review.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold">
                        {t('pages.importJob.imagesReview', { count: preview.images.review.length })}
                      </legend>
                      <p className="text-xs text-ink-muted">
                        {t('pages.importJob.imagesReviewHint')}
                      </p>
                      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {preview.images.review.map((image) => (
                          <li key={image.key} className="space-y-1">
                            <img
                              src={ds.importUrl(code, job.id, { image: image.key })}
                              alt={t('pages.importJob.imageAt', {
                                sheet: image.sheet,
                                anchor: image.anchor,
                              })}
                              loading="lazy"
                              className="aspect-video w-full rounded-lg border border-line bg-neutral-soft object-contain"
                            />
                            <input
                              type="number"
                              min={1}
                              className={CONTROL}
                              value={draft.image_rows[image.key] ?? ''}
                              aria-label={t('pages.importJob.imageRow', { anchor: image.anchor })}
                              placeholder={image.anchor}
                              onChange={(e) =>
                                update({
                                  image_rows: {
                                    ...draft.image_rows,
                                    [image.key]: e.target.value ? Number(e.target.value) : null,
                                  },
                                })
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button variant="ghost" icon={Trash2} onClick={() => setConfirm('cancel')}>
                  {t('pages.importJob.cancel')}
                </Button>
                {preview.counts.invalid + preview.counts.duplicate + preview.counts.review > 0 && (
                  <a
                    href={ds.importUrl(code, job.id, 'errors')}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <Download aria-hidden="true" className="size-4" />
                    {t('pages.importJob.downloadErrors')}
                  </a>
                )}
                <Button
                  icon={CheckCheck}
                  disabled={
                    stale ||
                    preview.counts.create + preview.counts.update + preview.counts.unchanged === 0
                  }
                  onClick={() => setConfirm('apply')}
                >
                  {t('pages.importJob.apply')}
                </Button>
              </div>
            </div>
          </Section>
        )}

        {(preview || done) && <RowsList code={code} job={job} />}
      </div>

      <ConfirmDialog
        open={confirm === 'apply'}
        title={t('pages.importJob.applyTitle', { name: job.original_filename })}
        body={[
          t('pages.importJob.applyBody', {
            create: preview?.counts.create ?? 0,
            update: preview?.counts.update ?? 0,
          }),
          job.config?.include_results && job.config.run
            ? t('pages.importJob.applyRun', { name: job.config.run.name })
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
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

export function ImportJobPage() {
  const code = useProjectCode()
  const { jobId = '' } = useParams()
  const can = useCan(code)
  const job = useImport(code, jobId)
  if (!can('import.manage')) return <NotFoundPage reason="item" />
  if (job.isPending) return <LoadingState rows={6} />
  if (job.isError) {
    return job.error instanceof ApiClientError && job.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={job.error} onRetry={() => void job.refetch()} />
    )
  }
  return job.data.import_target === 'DEFECTS' ? (
    <DefectImportJob key={job.data.id} job={job.data} />
  ) : (
    <ImportJob key={job.data.id} job={job.data} />
  )
}
