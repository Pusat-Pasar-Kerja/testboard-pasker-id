import type { ImportJobDto, ImportJobStatus, ImportTarget } from '@testboard/shared'
import { useMutation } from '@tanstack/react-query'
import { Download, FileSpreadsheet, LoaderCircle, UploadCloud } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Badge, type Tone } from '../components/ui/Badge'
import { FormAlert } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCan } from '../hooks/permissions'
import { useImports } from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { formatShortDateTime, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

const STATUS_TONE: Record<ImportJobStatus, Tone> = {
  UPLOADED: 'neutral',
  VALIDATING: 'info',
  PREVIEW: 'brand',
  IMPORTING: 'info',
  COMPLETED: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
}

export function ImportStatusBadge({ status }: { status: ImportJobStatus }) {
  const { t } = useTranslation()
  return (
    <Badge
      tone={STATUS_TONE[status]}
      icon={status === 'IMPORTING' ? LoaderCircle : undefined}
      label={t(`codes.importStatus.${status}`)}
    />
  )
}

function Uploader({ code }: { code: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const navigate = useNavigate()
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<ImportTarget>('TEST_CASES')
  const upload = useMutation({
    mutationFn: (file: File) => ds.uploadImport(code, file, { onProgress: setProgress, target }),
    onSuccess: (job) => navigate(projectPath(code, `imports/${job.id}`)),
    onError: (err) => {
      const reason = err instanceof ApiClientError ? err.details[0]?.message : undefined
      setError(
        reason
          ? t(`pages.imports.fileError.${reason}`, { defaultValue: t('errors.VALIDATION_ERROR') })
          : err instanceof ApiClientError
            ? t(`errors.${err.code}`)
            : t('errors.INTERNAL_ERROR'),
      )
    },
  })
  const start = (file: File | undefined) => {
    if (!file) return
    setError(null)
    setProgress(0)
    upload.mutate(file)
  }
  const base = import.meta.env.BASE_URL

  return (
    <Section title={t('pages.imports.newImport')}>
      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-semibold">{t('pages.imports.targetQuestion')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['TEST_CASES', 'DEFECTS'] as const).map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                target === value ? 'border-brand-300 bg-brand-50' : 'border-line bg-surface'
              }`}
            >
              <input
                type="radio"
                name="import-target"
                className="mt-0.5 size-4 accent-brand-700"
                checked={target === value}
                onChange={() => setTarget(value)}
              />
              <span>
                <span className="block font-semibold">{t(`pages.imports.target.${value}`)}</span>
                <span className="block text-xs text-ink-muted">
                  {t(`pages.imports.targetHint.${value}`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div
        onDragOver={(e: DragEvent) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          setDragging(false)
          start(e.dataTransfer.files[0])
        }}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 ease-soft ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-canvas'
        }`}
      >
        {upload.isPending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-brand-600" />
            <p className="text-sm text-ink-muted" aria-live="polite">
              {t('pages.imports.uploading')} {Math.round(progress * 100)}%
            </p>
          </>
        ) : (
          <>
            <UploadCloud aria-hidden="true" className="size-8 text-brand-600" />
            <p className="text-sm text-ink-muted">{t('pages.imports.drop')}</p>
            <label
              htmlFor={inputId}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {t('pages.imports.choose')}
            </label>
            <input
              id={inputId}
              type="file"
              accept=".xlsx,.csv,.json"
              className="sr-only"
              onChange={(e) => {
                start(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <p className="text-xs text-ink-muted">{t('pages.imports.rules')}</p>
          </>
        )}
      </div>
      <div className="mt-3 space-y-3">
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`${base}templates/testboard-import-template.csv`}
            download
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Download aria-hidden="true" className="size-4" />
            {t('pages.imports.templateCsv')}
          </a>
          <a
            href={`${base}templates/testboard-ai-import-sample.json`}
            download
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Download aria-hidden="true" className="size-4" />
            {t('pages.imports.templateJson')}
          </a>
        </div>
      </div>
    </Section>
  )
}

function JobItem({ code, job }: { code: string; job: ImportJobDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  return (
    <li>
      <Link
        to={projectPath(code, `imports/${job.id}`)}
        className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-xs hover:border-brand-200 hover:shadow-sm sm:flex-row sm:items-center"
      >
        <FileSpreadsheet aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{job.original_filename}</span>
          <span className="block text-xs text-ink-muted">
            {job.source_format} ·{' '}
            {job.import_target === 'DEFECTS'
              ? t('pages.imports.target.DEFECTS')
              : t(`codes.importMode.${job.import_mode}`)}{' '}
            · {job.created_by?.display_name ?? '-'} · {formatShortDateTime(job.created_at, locale)}
          </span>
          {job.total_rows > 0 && (
            <span className="block text-xs text-ink-muted">
              {t('pages.imports.rowsSummary', {
                total: job.total_rows,
                valid: job.valid_rows,
                invalid: job.invalid_rows,
              })}
            </span>
          )}
        </span>
        <ImportStatusBadge status={job.status_code} />
      </Link>
    </li>
  )
}

export function ImportsPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const allowed = can('import.manage')
  const { page, setPage } = useUrlFilters([] as const)
  const jobs = useImports(code, { page })

  return (
    <>
      <PageHeader
        title={t('pages.imports.title')}
        subtitle={t('pages.imports.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.imports.title') }]}
      />
      {!allowed ? (
        <EmptyState description={t('pages.imports.leadsOnly')} />
      ) : (
        <div className="space-y-6">
          <Uploader code={code} />
          <Section title={t('pages.imports.history')}>
            {jobs.isPending && <LoadingState rows={3} />}
            {jobs.isError && <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />}
            {jobs.isSuccess && jobs.data.total === 0 && (
              <EmptyState description={t('pages.imports.empty')} />
            )}
            {jobs.isSuccess && jobs.data.total > 0 && (
              <>
                <ul className="space-y-3">
                  {jobs.data.data.map((job) => (
                    <JobItem key={job.id} code={code} job={job} />
                  ))}
                </ul>
                <Pagination
                  page={jobs.data.page}
                  pageSize={jobs.data.page_size}
                  total={jobs.data.total}
                  onPageChange={setPage}
                />
              </>
            )}
          </Section>
        </div>
      )}
    </>
  )
}
