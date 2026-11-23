import {
  EVIDENCE_TYPES,
  FILE_PROCESSING_STATUSES,
  isFileUsable,
  type EvidenceItem,
  type FileProcessingStatus,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  ScrollText,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EvidenceUploader } from '../components/evidence/EvidenceUploader'
import { fileFacts } from '../components/evidence/file-facts'
import { Lightbox } from '../components/evidence/Lightbox'
import { useEvidenceUploads } from '../components/evidence/use-evidence-uploads'
import { Badge, type Tone } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FilterBar, SearchField, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCurrentUser, useFiles, useProject } from '../hooks/queries'
import { oneOf, projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { useDataSource } from '../services/use-data-source'

const STATUS_TONE: Record<FileProcessingStatus, { tone: Tone; icon?: LucideIcon }> = {
  READY: { tone: 'success' },
  PROCESSING: { tone: 'info', icon: LoaderCircle },
  FAILED: { tone: 'danger', icon: CircleAlert },
  REJECTED: { tone: 'danger', icon: CircleAlert },
}

function EvidenceCard({
  code,
  item,
  canDelete,
  onPreview,
  onDelete,
}: {
  code: string
  item: EvidenceItem
  canDelete: boolean
  onPreview: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const usable = isFileUsable(item)
  const isShot = item.evidence_type === 'SCREENSHOT'
  const Icon = item.evidence_type === 'LOG' ? ScrollText : FileText
  const viewable =
    usable && (item.evidence_type === 'LOG' || item.stored_mime === 'application/pdf')
  const status = STATUS_TONE[item.processing_status]

  return (
    <li className="flex animate-fade-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="flex aspect-video items-center justify-center bg-neutral-soft">
        {isShot && usable ? (
          <button
            type="button"
            onClick={onPreview}
            className="size-full"
            aria-label={t('evidence.preview', { name: item.original_filename })}
          >
            <img
              src={ds.fileUrl(code, item.id, item.has_thumbnail ? 'thumbnail' : 'preview')}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
            <span className="sr-only">
              {t('evidence.preview', { name: item.original_filename })}
            </span>
          </button>
        ) : (
          <Icon aria-hidden="true" className="size-10 text-ink-muted" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
        <p className="truncate font-medium" title={item.original_filename}>
          {item.original_filename}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="muted" label={t(`codes.evidenceType.${item.evidence_type}`)} />
          <Badge
            tone={status.tone}
            icon={status.icon}
            label={t(`codes.fileStatus.${item.processing_status}`)}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {usable
            ? fileFacts(t, locale, item)
            : item.failure_reason
              ? t(`evidence.reason.${item.failure_reason}`)
              : t('evidence.status.processing')}
        </p>
        <p className="text-xs text-ink-muted">
          {t('pages.evidence.uploader', { name: item.uploaded_by?.display_name ?? '-' })} ·{' '}
          {formatShortDateTime(item.uploaded_at, locale)}
        </p>
        <div className="text-xs">
          <span className="text-ink-muted">{t('pages.evidence.usedIn')}: </span>
          {item.usages.length === 0 ? (
            <span className="text-ink-muted">{t('pages.evidence.notUsed')}</span>
          ) : (
            item.usages.map((usage, index) => (
              <span key={`${usage.kind}-${usage.path}`}>
                {index > 0 && ', '}
                <Link
                  to={projectPath(code, usage.path)}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {usage.label}
                </Link>
              </span>
            ))
          )}
        </div>
        <div className="mt-auto flex items-center justify-end gap-1 pt-1">
          {viewable && (
            <a
              href={ds.fileUrl(code, item.id, 'preview')}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex size-9 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"
              title={t('evidence.open')}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">
                {t('evidence.open')} {item.original_filename}
              </span>
            </a>
          )}
          {usable && (
            <a
              href={ds.fileUrl(code, item.id, 'download')}
              className="inline-flex size-9 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"
              title={t('evidence.download')}
            >
              <Download aria-hidden="true" className="size-4" />
              <span className="sr-only">
                {t('evidence.download')} {item.original_filename}
              </span>
            </a>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-soft hover:text-danger"
              title={t('pages.evidence.deleteTitle', { name: item.original_filename })}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              <span className="sr-only">
                {t('pages.evidence.deleteTitle', { name: item.original_filename })}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export function EvidencePage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const can = useCan(code)
  const me = useCurrentUser()
  const project = useProject(code)
  const { values, page, setFilter, setPage, reset, active } = useUrlFilters([
    'q',
    'type',
    'status',
    'usage',
  ] as const)
  const files = useFiles(code, {
    q: values.q || undefined,
    type: oneOf(EVIDENCE_TYPES, values.type),
    status: oneOf(FILE_PROCESSING_STATUSES, values.status),
    unlinked: values.usage === 'unlinked',
    page,
  })
  const uploads = useEvidenceUploads(code)
  const [preview, setPreview] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<EvidenceItem | null>(null)
  const isLead =
    Boolean(me.data?.system_role) || ['ADMIN', 'QA_LEAD'].includes(project.data?.role_code ?? '')

  // New uploads appear in the list once the server has decided about them.
  const settled = uploads.items.filter(
    (i) => i.phase !== 'uploading' && i.phase !== 'processing',
  ).length
  useEffect(() => {
    if (settled > 0) void queryClient.invalidateQueries({ queryKey: ['files', code] })
  }, [settled, code, queryClient])

  const remove = useMutation({
    mutationFn: (fileId: string) => ds.deleteFile(code, fileId),
    onSuccess: async () => {
      setPendingDelete(null)
      toast.show(t('pages.evidence.deleted'))
      await queryClient.invalidateQueries({ queryKey: ['files', code] })
    },
    onError: (error) => {
      setPendingDelete(null)
      toast.show(apiErrorText(t, error))
    },
  })

  const items = files.data?.data ?? []
  const screenshots = items
    .filter((item) => item.evidence_type === 'SCREENSHOT' && isFileUsable(item))
    .map((item) => ({ ...item, caption: null, step_number: null }))

  return (
    <>
      <PageHeader
        title={t('pages.evidence.title')}
        subtitle={t('pages.evidence.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.evidence.title') }]}
      />

      {can('file.upload') && (
        <Section
          title={t('pages.evidence.upload')}
          description={t('pages.evidence.uploadHint')}
          className="mb-6"
        >
          <EvidenceUploader uploads={uploads} />
        </Section>
      )}

      <FilterBar onReset={active ? reset : undefined}>
        <SearchField
          label={t('filters.keyword')}
          placeholder={t('pages.evidence.searchPlaceholder')}
          value={values.q}
          onSearch={(value) => setFilter('q', value)}
        />
        <SelectFilter
          label={t('filters.type')}
          value={values.type}
          onChange={(value) => setFilter('type', value)}
          options={EVIDENCE_TYPES.map((type) => ({
            value: type,
            label: t(`codes.evidenceType.${type}`),
          }))}
        />
        <SelectFilter
          label={t('filters.fileStatus')}
          value={values.status}
          onChange={(value) => setFilter('status', value)}
          options={FILE_PROCESSING_STATUSES.map((status) => ({
            value: status,
            label: t(`codes.fileStatus.${status}`),
          }))}
        />
        <SelectFilter
          label={t('pages.evidence.usedIn')}
          value={values.usage}
          onChange={(value) => setFilter('usage', value)}
          options={[{ value: 'unlinked', label: t('pages.evidence.unlinkedOnly') }]}
        />
      </FilterBar>

      {files.isPending && <LoadingState rows={4} />}
      {files.isError && <ErrorState error={files.error} onRetry={() => void files.refetch()} />}
      {files.isSuccess && files.data.total === 0 && (
        <EmptyState
          filtered={active}
          description={active ? t('pages.evidence.emptyFiltered') : t('pages.evidence.empty')}
        />
      )}
      {files.isSuccess && files.data.total > 0 && (
        <>
          <ul
            aria-label={t('pages.evidence.title')}
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${
              files.isPlaceholderData ? 'opacity-60 transition-opacity' : ''
            }`}
          >
            {items.map((item) => (
              <EvidenceCard
                key={item.id}
                code={code}
                item={item}
                canDelete={
                  item.usages.length === 0 &&
                  can('file.upload') &&
                  (isLead || item.uploaded_by?.id === me.data?.id)
                }
                onPreview={() => setPreview(screenshots.findIndex((s) => s.id === item.id))}
                onDelete={() => setPendingDelete(item)}
              />
            ))}
          </ul>
          <Pagination
            page={files.data.page}
            pageSize={files.data.page_size}
            total={files.data.total}
            onPageChange={setPage}
          />
        </>
      )}

      {preview !== null && preview >= 0 && (
        <Lightbox
          files={screenshots}
          index={preview}
          urlOf={(file, kind) => ds.fileUrl(code, file.id, kind)}
          onIndex={setPreview}
          onClose={() => setPreview(null)}
        />
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? t('pages.evidence.deleteTitle', { name: pendingDelete.original_filename })
            : ''
        }
        body={t('pages.evidence.deleteBody')}
        confirmLabel={t('actions.remove')}
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
