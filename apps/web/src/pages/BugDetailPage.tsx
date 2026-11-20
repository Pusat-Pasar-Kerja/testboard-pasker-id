import {
  DEFECT_REASON_REQUIRED,
  defectEditableFields,
  defectTransitionsFor,
  type DefectActor,
  type DefectDetail,
  type DefectLinkedExecution,
  type DefectStatus,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  BadgeCheck,
  CheckCheck,
  Hammer,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  Unlink,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { AttachmentsPanel } from '../components/evidence/AttachmentsPanel'
import {
  DefectPriorityBadge,
  DefectStatusBadge,
  ExecutionStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, TextArea, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { DescriptionList, Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan, useDefectActor } from '../hooks/permissions'
import { invalidateDefectData, useCurrentUser, useDefect } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { formatDateTime, formatShortDateTime, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

const ACTION_ICON: Record<DefectStatus, LucideIcon> = {
  OPEN: RotateCcw,
  IN_PROGRESS: Wrench,
  FIXED: Hammer,
  READY_FOR_RETEST: RotateCcw,
  VERIFIED: BadgeCheck,
  REOPENED: RotateCcw,
  CLOSED: CheckCheck,
  WONT_FIX: Ban,
}

/** Statuses a bug can be moved into ('OPEN' is only the starting state). */
type TargetStatus = Exclude<DefectStatus, 'OPEN'>

/** The one forward step is the primary button; going back or declining stays secondary. */
const PRIMARY: readonly DefectStatus[] = [
  'IN_PROGRESS',
  'FIXED',
  'READY_FOR_RETEST',
  'VERIFIED',
  'CLOSED',
]

function StatusActions({
  code,
  defect,
  actor,
}: {
  code: string
  defect: DefectDetail
  actor: DefectActor
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<TargetStatus | null>(null)
  const [comment, setComment] = useState('')
  const [fixVersion, setFixVersion] = useState(defect.fixed_in_version ?? '')
  const [error, setError] = useState<string | null>(null)
  const reasonRequired = target !== null && DEFECT_REASON_REQUIRED.includes(target)
  const asksFixVersion = target === 'FIXED' || target === 'READY_FOR_RETEST'

  const change = useMutation({
    mutationFn: (to: DefectStatus) =>
      ds.changeDefectStatus(code, defect.id, {
        status_code: to,
        expected_status: defect.status_code,
        comment: comment.trim() || null,
        fixed_in_version: asksFixVersion ? fixVersion.trim() || null : undefined,
      }),
    onSuccess: async (updated) => {
      setTarget(null)
      await invalidateDefectData(queryClient, code)
      toast.show(
        t('pages.bugDetail.statusChanged', {
          code: updated.bug_code,
          status: t(`codes.defectStatus.${updated.status_code}`),
        }),
      )
    },
    onError: async (err) => {
      setError(apiErrorText(t, err))
      // Someone else may have moved the bug meanwhile: show the current state.
      if (err instanceof ApiClientError && err.status === 409) {
        await invalidateDefectData(queryClient, code)
      }
    },
  })

  const open = (to: TargetStatus) => {
    setTarget(to)
    setComment('')
    setError(null)
  }

  return (
    <>
      {(defectTransitionsFor(defect.status_code, actor) as TargetStatus[]).map((to) => (
        <Button
          key={to}
          icon={ACTION_ICON[to]}
          variant={PRIMARY.includes(to) ? 'primary' : 'secondary'}
          onClick={() => open(to)}
        >
          {t(`pages.bugDetail.action.${to}`)}
        </Button>
      ))}
      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? t('pages.bugDetail.statusTitle', {
                code: defect.bug_code,
                status: t(`codes.defectStatus.${target}`),
              })
            : ''
        }
        body={
          target &&
          (target === 'VERIFIED' ||
          target === 'REOPENED' ||
          target === 'WONT_FIX' ||
          target === 'CLOSED'
            ? t(`pages.bugDetail.statusHint.${target}`)
            : t('pages.bugDetail.statusNote'))
        }
        confirmLabel={target ? t(`pages.bugDetail.action.${target}`) : ''}
        tone={target === 'WONT_FIX' ? 'danger' : 'primary'}
        busy={change.isPending}
        onConfirm={() => {
          if (!target) return
          if (reasonRequired && !comment.trim()) {
            setError(t('form.required'))
            return
          }
          change.mutate(target)
        }}
        onCancel={() => setTarget(null)}
      >
        <div className="mt-4 space-y-4">
          {asksFixVersion && (
            <TextField
              label={t('fields.fixedIn')}
              value={fixVersion}
              onChange={(e) => setFixVersion(e.target.value)}
              placeholder="1.2.1"
            />
          )}
          <TextArea
            label={reasonRequired ? t('fields.reason') : t('fields.notes')}
            required={reasonRequired}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              setError(null)
            }}
            rows={3}
            maxLength={1000}
          />
          <FormAlert message={error} />
        </div>
      </ConfirmDialog>
    </>
  )
}

function CommentForm({ code, defectId }: { code: string; defectId: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: () => ds.addDefectComment(code, defectId, body),
    onSuccess: async () => {
      setBody('')
      await invalidateDefectData(queryClient, code)
      toast.show(t('pages.bugDetail.commentAdded'))
    },
    onError: (err) => setError(apiErrorText(t, err)),
  })
  return (
    <form
      className="mt-5 space-y-3 border-t border-line pt-5"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (!body.trim()) {
          setError(t('form.required'))
          return
        }
        setError(null)
        send.mutate()
      }}
    >
      <TextArea
        label={t('pages.bugDetail.commentLabel')}
        required
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setError(null)
        }}
        placeholder={t('pages.bugDetail.commentPlaceholder')}
        rows={3}
      />
      <FormAlert message={error} />
      <div className="flex justify-end">
        <Button type="submit" icon={Send} loading={send.isPending}>
          {t('pages.bugDetail.commentSubmit')}
        </Button>
      </div>
    </form>
  )
}

function LinkedExecutions({
  code,
  defect,
  canUnlink,
}: {
  code: string
  defect: DefectDetail
  canUnlink: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<DefectLinkedExecution | null>(null)
  const unlink = useMutation({
    mutationFn: (executionId: string) => ds.unlinkDefectExecution(code, defect.id, executionId),
    onSuccess: async () => {
      setPending(null)
      await invalidateDefectData(queryClient, code)
      toast.show(t('pages.bugDetail.unlinked'))
    },
    onError: (err) => {
      setPending(null)
      toast.show(apiErrorText(t, err))
    },
  })

  if (defect.linked_executions.length === 0) {
    return <p className="text-sm text-ink-muted">{t('pages.bugDetail.noLinked')}</p>
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {defect.linked_executions.map((link) => (
          <li
            key={link.execution_id}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm">
              <Link
                to={projectPath(code, `runs/${link.run_id}`)}
                className="font-semibold text-brand-700 hover:underline"
              >
                {link.run_code}
              </Link>{' '}
              /{' '}
              <Link
                to={projectPath(code, `runs/${link.run_id}/cases/${link.run_case_id}`)}
                className="font-semibold text-brand-700 hover:underline"
              >
                {link.case_code}
              </Link>{' '}
              / {t('fields.attempt', { n: link.attempt_number })}
            </span>
            <span className="flex items-center gap-2">
              <ExecutionStatusBadge status={link.result_status} />
              {link.tested_at && (
                <span className="text-xs text-ink-muted">
                  {formatShortDateTime(link.tested_at, locale)}
                </span>
              )}
              {canUnlink && (
                <button
                  type="button"
                  onClick={() => setPending(link)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-neutral-soft hover:text-danger"
                  title={t('pages.bugDetail.unlink', {
                    case: link.case_code,
                    n: link.attempt_number,
                  })}
                >
                  <Unlink aria-hidden="true" className="size-4" />
                  <span className="sr-only">
                    {t('pages.bugDetail.unlink', {
                      case: link.case_code,
                      n: link.attempt_number,
                    })}
                  </span>
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? t('pages.bugDetail.unlinkTitle', {
                case: pending.case_code,
                n: pending.attempt_number,
              })
            : ''
        }
        body={t('pages.bugDetail.unlinkBody')}
        confirmLabel={t('actions.remove')}
        busy={unlink.isPending}
        onConfirm={() => pending && unlink.mutate(pending.execution_id)}
        onCancel={() => setPending(null)}
      />
    </>
  )
}

export function BugDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { bugId = '' } = useParams()
  const defect = useDefect(code, bugId)
  const actor = useDefectActor(code, defect.data)
  const can = useCan(code)
  const me = useCurrentUser()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const none = t('fields.none')

  if (defect.isPending) return <LoadingState rows={6} />
  if (defect.isError) {
    return defect.error instanceof ApiClientError && defect.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={defect.error} onRetry={() => void defect.refetch()} />
    )
  }
  const d = defect.data
  const canEdit = actor !== null && defectEditableFields(actor).length > 0

  return (
    <>
      <PageHeader
        title={d.title}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.bugs.title'), to: projectPath(code, 'bugs') },
          { label: d.bug_code },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{d.bug_code}</span>
            <DefectStatusBadge status={d.status_code} />
            <SeverityBadge severity={d.severity_code} />
            <DefectPriorityBadge priority={d.priority_code} />
          </>
        }
        actions={
          <>
            {actor && <StatusActions key={d.status_code} code={code} defect={d} actor={actor} />}
            {canEdit && (
              <ButtonLink to={projectPath(code, `bugs/${d.id}/edit`)} variant="ghost" icon={Pencil}>
                {t('actions.edit')}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title={t('pages.bugDetail.details')}>
            <DescriptionList
              items={[
                { label: t('fields.description'), value: d.description ?? none, wide: true },
                {
                  label: t('fields.stepsToReproduce'),
                  value: d.steps_to_reproduce ?? none,
                  wide: true,
                },
                { label: t('fields.expectedBehavior'), value: d.expected_behavior ?? none },
                { label: t('fields.actualBehavior'), value: d.actual_behavior ?? none },
              ]}
            />
          </Section>

          <Section title={t('pages.bugDetail.files')}>
            <AttachmentsPanel
              projectCode={code}
              files={d.files}
              canAttach={
                can('file.upload') &&
                actor !== null &&
                (actor.role !== 'DEVELOPER' || actor.isAssignee)
              }
              canDetach={(file) =>
                actor?.role === 'ADMIN' ||
                actor?.role === 'QA_LEAD' ||
                (file.uploaded_by !== null && file.uploaded_by.id === me.data?.id)
              }
              onAttach={async (refs) => {
                await ds.attachDefectFiles(code, d.id, refs)
                await invalidateDefectData(queryClient, code)
              }}
              onDetach={async (fileId) => {
                await ds.detachDefectFile(code, d.id, fileId)
                await invalidateDefectData(queryClient, code)
              }}
            />
          </Section>

          <Section title={t('pages.bugDetail.linkedExecutions')}>
            <LinkedExecutions code={code} defect={d} canUnlink={can('defect.link')} />
          </Section>

          <Section title={t('pages.bugDetail.comments')}>
            {d.comments.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('pages.bugDetail.noComments')}</p>
            ) : (
              <ul className="space-y-4">
                {d.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3">
                    <MessageSquare
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-ink-muted"
                    />
                    <div className="min-w-0">
                      <p className="text-sm">
                        <strong className="font-semibold">
                          {comment.author?.display_name ?? none}
                        </strong>{' '}
                        <span className="text-xs text-ink-muted">
                          {formatDateTime(comment.created_at, locale)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm break-words whitespace-pre-line">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {can('defect.comment') && <CommentForm code={code} defectId={d.id} />}
          </Section>
        </div>

        <div className="space-y-6">
          <Section headingLevel={2}>
            <DescriptionList
              items={[
                { label: t('fields.reporter'), value: d.reported_by?.display_name ?? none },
                { label: t('fields.assignee'), value: d.assigned_to?.display_name ?? none },
                {
                  label: t('fields.module'),
                  value: d.module ? `${d.module.module_code} - ${d.module.name}` : none,
                },
                { label: t('fields.source'), value: t(`codes.defectSource.${d.source_kind}`) },
                { label: t('fields.environment'), value: d.environment_name ?? none },
                { label: t('fields.build'), value: d.build_version ?? none },
                { label: t('fields.browser'), value: d.browser_name ?? none },
                { label: t('fields.fixedIn'), value: d.fixed_in_version ?? none },
                { label: t('fields.createdAt'), value: formatDateTime(d.created_at, locale) },
                { label: t('fields.updatedAt'), value: formatDateTime(d.updated_at, locale) },
              ]}
            />
          </Section>

          <Section
            title={t('pages.bugDetail.history')}
            description={t('pages.bugDetail.workflowHint')}
          >
            <ol className="relative space-y-4 border-l border-line pl-5">
              {d.history.map((entry, index) => (
                <li key={index} className="relative animate-fade-in">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-brand-600 ring-2 ring-surface"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {entry.from_status ? (
                      <>
                        <DefectStatusBadge status={entry.from_status} />
                        <span aria-hidden="true">→</span>
                        <DefectStatusBadge status={entry.to_status} />
                      </>
                    ) : (
                      <span>
                        {t('pages.bugDetail.created', {
                          to: t(`codes.defectStatus.${entry.to_status}`),
                        })}
                      </span>
                    )}
                  </div>
                  {entry.change_comment && (
                    <p className="mt-1 text-sm break-words">{entry.change_comment}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-muted">
                    {entry.changed_by?.display_name ?? none} ·{' '}
                    {formatDateTime(entry.changed_at, locale)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  )
}
