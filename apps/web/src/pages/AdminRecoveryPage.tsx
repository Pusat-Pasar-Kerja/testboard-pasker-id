import type { RecoveryRequestDto, RecoveryStatus, ResetLinkDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CheckCheck,
  KeyRound,
  Link2,
  LockKeyhole,
  RotateCcw,
  Unlink,
  UserSearch,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateRecovery } from '../components/recovery/reset-link'
import { ResetLinkDialog } from '../components/recovery/ResetLinkDialog'
import { ValidityBar } from '../components/recovery/ValidityBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { SelectField, TextArea } from '../components/ui/Form'
import { FormDialog } from '../components/ui/FormDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toast-context'
import {
  useAdminUsers,
  useCurrentUser,
  useRecoveryRequests,
  useRecoverySummary,
  useResetLinks,
} from '../hooks/queries'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

type Filter = RecoveryStatus | 'ALL'

function ActiveLinkRow({ link }: { link: ResetLinkDto }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const revoke = useMutation({
    mutationFn: () => ds.revokeResetLink(link.user.id),
    onSuccess: async () => {
      setConfirm(false)
      await invalidateRecovery(queryClient)
      toast.show(t('recovery.admin.revoked', { email: link.user.email }))
    },
    onError: (error) => {
      setConfirm(false)
      void invalidateRecovery(queryClient)
      toast.show(apiErrorText(t, error), 'error')
    },
  })
  return (
    <li className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{link.user.display_name}</p>
        <p className="truncate text-xs text-ink-muted">{link.user.email}</p>
        {link.issued_by && (
          <p className="text-xs text-ink-muted">
            {t('recovery.admin.issuedBy', { name: link.issued_by.display_name })}
          </p>
        )}
      </div>
      <ValidityBar issuedAt={link.issued_at} expiresAt={link.expires_at} compact />
      <Button variant="ghost" icon={Unlink} onClick={() => setConfirm(true)}>
        {t('recovery.admin.revoke')}
      </Button>
      <ConfirmDialog
        open={confirm}
        title={t('recovery.admin.revokeTitle', { email: link.user.email })}
        body={t('recovery.admin.revokeBody')}
        confirmLabel={t('recovery.admin.revoke')}
        busy={revoke.isPending}
        onConfirm={() => revoke.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  )
}

function AccountPicker({ request }: { request: RecoveryRequestDto }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const users = useAdminUsers('')
  const [userId, setUserId] = useState('')
  const link = useMutation({
    mutationFn: () => ds.updateRecoveryRequest(request.id, { user_id: userId }),
    onSuccess: async () => {
      await invalidateRecovery(queryClient)
      toast.show(t('recovery.admin.linked'))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  const options = [
    { value: '', label: t('recovery.admin.pickAccount') },
    ...(users.data ?? []).map((u) => ({ value: u.id, label: `${u.display_name} · ${u.email}` })),
  ]
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <SelectField
        className="min-w-0 flex-1"
        label={t('recovery.admin.findAccount')}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        options={options}
      />
      <Button
        variant="secondary"
        icon={UserSearch}
        disabled={!userId}
        loading={link.isPending}
        onClick={() => link.mutate()}
      >
        {t('recovery.admin.linkAccount')}
      </Button>
    </div>
  )
}

function RequestCard({ request }: { request: RecoveryRequestDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [issueOpen, setIssueOpen] = useState(false)
  const [closing, setClosing] = useState<'RESOLVED' | 'DISMISSED' | null>(null)
  const [note, setNote] = useState('')
  const open = request.status === 'OPEN'
  const account = request.user

  const update = useMutation({
    mutationFn: (input: { status: RecoveryStatus; note?: string }) =>
      ds.updateRecoveryRequest(request.id, input),
    onSuccess: async (saved) => {
      setClosing(null)
      setNote('')
      await invalidateRecovery(queryClient)
      toast.show(t(`recovery.admin.statusSaved.${saved.status}`))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })

  const blocked = !account
    ? null
    : account.is_permanent
      ? t('recovery.admin.ownerOnServer')
      : !account.is_active
        ? t('recovery.errors.ACCOUNT_INACTIVE')
        : null

  return (
    <li className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          tone={request.kind === 'FORGOT_PASSWORD' ? 'info' : 'brand'}
          icon={request.kind === 'FORGOT_PASSWORD' ? KeyRound : UserSearch}
          label={t(`recovery.kind.${request.kind}`)}
        />
        <Badge
          tone={open ? 'warning' : request.status === 'RESOLVED' ? 'success' : 'muted'}
          label={t(`recovery.status.${request.status}`)}
        />
        <span className="text-xs text-ink-muted">
          {t('recovery.admin.sentAt', {
            date: formatShortDateTime(request.last_submitted_at, locale),
          })}
          {request.submit_count > 1 &&
            ` · ${t('recovery.admin.sentTimes', { count: request.submit_count })}`}
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-muted">{t('fields.displayName')}</dt>
          <dd className="font-semibold">{request.name}</dd>
        </div>
        {request.email && (
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">{t('recovery.admin.typedEmail')}</dt>
            <dd className="break-all">{request.email}</dd>
          </div>
        )}
        {request.contact && (
          <div className="min-w-0">
            <dt className="text-xs text-ink-muted">{t('recovery.request.contact')}</dt>
            <dd className="break-words">{request.contact}</dd>
          </div>
        )}
        {request.message && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-ink-muted">{t('recovery.request.message')}</dt>
            <dd className="break-words whitespace-pre-line">{request.message}</dd>
          </div>
        )}
      </dl>

      <div className="space-y-2 rounded-lg bg-canvas p-3">
        {account ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">{t('recovery.admin.account')}</span>
            <span className="font-semibold">{account.display_name}</span>
            <span className="break-all">{account.email}</span>
            {account.is_permanent && (
              <Badge tone="brand" icon={LockKeyhole} label={t('pages.adminUsers.permanent')} />
            )}
            {!account.is_active && <Badge tone="muted" label={t('pages.adminUsers.inactive')} />}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            {request.kind === 'FORGOT_PASSWORD'
              ? t('recovery.admin.noMatch')
              : t('recovery.admin.findHint')}
          </p>
        )}
        {!account && open && <AccountPicker request={request} />}
        {request.active_link && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink-muted">{t('recovery.admin.activeLink')}</p>
            <ValidityBar
              issuedAt={request.active_link.issued_at}
              expiresAt={request.active_link.expires_at}
              compact
            />
          </div>
        )}
        {blocked && <p className="text-xs text-ink-muted">{blocked}</p>}
      </div>

      {!open && (
        <p className="text-xs text-ink-muted">
          {request.handled_by
            ? t(
                `recovery.admin.handled.${request.status === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED'}`,
                {
                  name: request.handled_by.display_name,
                  date: request.handled_at ? formatShortDateTime(request.handled_at, locale) : '-',
                },
              )
            : t('recovery.admin.handledAuto')}
          {request.note && ` · ${request.note}`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {open ? (
          <>
            {account && !blocked && (
              <Button icon={Link2} onClick={() => setIssueOpen(true)}>
                {request.active_link ? t('recovery.admin.newLink') : t('recovery.admin.issueLink')}
              </Button>
            )}
            <Button variant="secondary" icon={CheckCheck} onClick={() => setClosing('RESOLVED')}>
              {t('recovery.admin.resolve')}
            </Button>
            <Button variant="ghost" icon={XCircle} onClick={() => setClosing('DISMISSED')}>
              {t('recovery.admin.dismiss')}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            icon={RotateCcw}
            loading={update.isPending}
            onClick={() => update.mutate({ status: 'OPEN' })}
          >
            {t('recovery.admin.reopen')}
          </Button>
        )}
      </div>

      {account && (
        <ResetLinkDialog
          open={issueOpen}
          user={account}
          activeLink={request.active_link}
          requestId={request.id}
          onClose={() => setIssueOpen(false)}
        />
      )}
      <FormDialog
        open={closing !== null}
        title={closing ? t(`recovery.admin.closeTitle.${closing}`) : ''}
        description={request.name}
        submitLabel={
          closing === 'DISMISSED' ? t('recovery.admin.dismiss') : t('recovery.admin.resolve')
        }
        busy={update.isPending}
        onSubmit={() => closing && update.mutate({ status: closing, note })}
        onCancel={() => setClosing(null)}
      >
        <TextArea
          label={t('recovery.admin.note')}
          hint={t('recovery.admin.noteHint')}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormDialog>
    </li>
  )
}

function RequestList({ filter }: { filter: Filter }) {
  const { t } = useTranslation()
  const requests = useRecoveryRequests(filter)
  if (requests.isPending) return <LoadingState rows={3} />
  if (requests.isError) {
    return <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
  }
  if (requests.data.length === 0) {
    return (
      <EmptyState
        description={filter === 'OPEN' ? t('recovery.admin.emptyOpen') : t('recovery.admin.empty')}
      />
    )
  }
  return (
    <ul className="mt-4 space-y-3">
      {requests.data.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </ul>
  )
}

/** Super Admin inbox for "Lupa kata sandi / Lupa email" requests and reset links (ADR 0012). */
export function AdminRecoveryPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const isSuperAdmin = Boolean(me.data?.is_super_admin)
  const summary = useRecoverySummary(isSuperAdmin)
  const links = useResetLinks(isSuperAdmin)
  const [filter, setFilter] = useState<Filter>('OPEN')

  if (!isSuperAdmin) return <NotFoundPage reason="item" />
  const filters: Filter[] = ['OPEN', 'RESOLVED', 'DISMISSED', 'ALL']

  return (
    <>
      <PageHeader title={t('recovery.admin.title')} subtitle={t('recovery.admin.subtitle')} />
      <div className="space-y-6">
        <p className="flex gap-2 rounded-xl bg-info-soft p-3 text-sm text-info">
          <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t('recovery.admin.howNotified')}</span>
        </p>
        <Section
          title={t('recovery.admin.activeLinks')}
          description={t('recovery.admin.activeLinksHint')}
        >
          {links.isPending && <LoadingState rows={2} />}
          {links.isError && <ErrorState error={links.error} onRetry={() => void links.refetch()} />}
          {links.isSuccess && links.data.length === 0 && (
            <p className="text-sm text-ink-muted">{t('recovery.admin.noActiveLinks')}</p>
          )}
          {links.isSuccess && links.data.length > 0 && (
            <ul className="divide-y divide-line">
              {links.data.map((link) => (
                <ActiveLinkRow key={link.id} link={link} />
              ))}
            </ul>
          )}
        </Section>
        <Section title={t('recovery.admin.requests')}>
          <Tabs
            label={t('recovery.admin.requests')}
            active={filter}
            onChange={(id) => setFilter(id as Filter)}
            tabs={filters.map((id) => ({
              id,
              label: t(`recovery.filter.${id}`),
              count: id === 'OPEN' ? summary.data?.open_requests : undefined,
              content: <RequestList filter={id} />,
            }))}
          />
        </Section>
      </div>
    </>
  )
}
