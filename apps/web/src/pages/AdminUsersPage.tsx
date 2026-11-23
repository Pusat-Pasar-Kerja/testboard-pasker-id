import { SYSTEM_ROLES, type AdminUserDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, LockKeyhole, ShieldCheck, UserPlus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ResetLinkDialog } from '../components/recovery/ResetLinkDialog'
import { ValidityBar } from '../components/recovery/ValidityBar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FilterBar, SearchField } from '../components/ui/Filters'
import { FormAlert, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import type { TFunction } from 'i18next'
import { useAdminUsers, useCurrentUser } from '../hooks/queries'
import { apiErrorText } from '../lib/api-errors'
import { ApiClientError } from '../services/api-client'
import type { SystemRoleChoice } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

/** User first: most accounts are Users; the website roles come after (ADR 0017). */
const ROLE_CHOICES: SystemRoleChoice[] = ['NONE', ...[...SYSTEM_ROLES].reverse()]

/** Pengguna / Admin / Super Admin, each with what it may do. */
function RoleChoice({
  value,
  onChange,
}: {
  value: SystemRoleChoice
  onChange: (value: SystemRoleChoice) => void
}) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <fieldset className="sm:col-span-2">
      <legend className="mb-2 text-sm font-semibold">{t('pages.adminUsers.roleLegend')}</legend>
      <div className="grid gap-2 md:grid-cols-3">
        {ROLE_CHOICES.map((role) => (
          <label
            key={role}
            className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 text-sm ${
              value === role ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={value === role}
              onChange={() => onChange(role)}
              className="mt-0.5 size-4 accent-brand-700"
            />
            <span>
              <span className="block font-semibold">{t(`codes.systemRole.${role}`)}</span>
              <span className="block text-ink-muted">{t(`codes.systemRoleHelp.${role}`)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function message(t: TFunction, error: unknown) {
  if (error instanceof ApiClientError && error.status === 422) return t('form.invalid')
  return apiErrorText(t, error)
}

function TemporaryPassword({ email, password }: { email: string; password: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div
      role="status"
      className="mt-4 animate-fade-in rounded-xl border border-brand-200 bg-brand-50 p-4"
    >
      <p className="text-sm font-semibold">{t('pages.adminUsers.tempPasswordTitle', { email })}</p>
      <p className="mt-1 text-xs text-ink-muted">{t('pages.adminUsers.tempPasswordBody')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-surface px-3 py-2 font-mono text-sm select-all">
          {password}
        </code>
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={() =>
            void navigator.clipboard?.writeText(password).then(
              () => setCopied(true),
              () => undefined,
            )
          }
        >
          {copied ? t('actions.copied') : t('actions.copy')}
        </Button>
      </div>
    </div>
  )
}

function CreateUserForm() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<SystemRoleChoice>('NONE')
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  const create = useMutation({
    mutationFn: () =>
      ds.createUser({ email: email.trim(), display_name: name.trim(), system_role: role }),
    onSuccess: async (result) => {
      setEmail('')
      setName('')
      setRole('NONE')
      setIssued(
        result.temporary_password
          ? { email: result.user.email, password: result.temporary_password }
          : null,
      )
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.show(t('pages.adminUsers.created', { email: result.user.email }))
    },
  })

  return (
    <>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          setIssued(null)
          if (email.trim() && name.trim()) create.mutate()
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <TextField
          label={t('fields.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('fields.displayName')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <RoleChoice value={role} onChange={setRole} />
        <div className="sm:col-span-2">
          <FormAlert message={create.isError ? message(t, create.error) : null} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" icon={UserPlus} loading={create.isPending}>
            {t('pages.adminUsers.create')}
          </Button>
        </div>
      </form>
      {issued && <TemporaryPassword email={issued.email} password={issued.password} />}
    </>
  )
}

function UserRow({ user, isMe }: { user: AdminUserDto; isMe: boolean }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  // A role change is confirmed first (owner audit: nothing changes by accident).
  const [pendingRole, setPendingRole] = useState<SystemRoleChoice | null>(null)
  const roleSelectId = useId()
  const currentRole: SystemRoleChoice = user.system_role ?? 'NONE'

  const update = useMutation({
    mutationFn: (input: { is_active?: boolean; system_role?: SystemRoleChoice }) =>
      ds.updateUser(user.id, input),
    onSuccess: async (updated) => {
      setConfirmDeactivate(false)
      setPendingRole(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      if (isMe) await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.show(t('pages.adminUsers.updated', { name: updated.display_name }))
    },
    onError: (error) => {
      setConfirmDeactivate(false)
      setPendingRole(null)
      toast.show(message(t, error), 'error')
    },
  })

  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {user.display_name}
          {user.is_permanent ? (
            <Badge tone="brand" icon={LockKeyhole} label={t('pages.adminUsers.permanent')} />
          ) : (
            user.system_role && (
              <Badge
                tone="brand"
                icon={ShieldCheck}
                label={t(`codes.systemRole.${user.system_role}`)}
              />
            )
          )}
          {user.is_active && !user.has_password && (
            <Badge tone="warning" label={t('pages.members.notActivated')} />
          )}
          <Badge
            tone={user.is_active ? 'success' : 'muted'}
            label={user.is_active ? t('pages.adminUsers.active') : t('pages.adminUsers.inactive')}
          />
        </p>
        <p className="truncate text-xs text-ink-muted">{user.email}</p>
        {user.is_permanent && (
          <p className="text-xs text-ink-muted">{t('pages.adminUsers.permanentHint')}</p>
        )}
        {user.reset_link && (
          <div className="mt-2 max-w-sm space-y-1">
            <p className="text-xs font-semibold text-ink-muted">{t('recovery.admin.activeLink')}</p>
            <ValidityBar
              issuedAt={user.reset_link.issued_at}
              expiresAt={user.reset_link.expires_at}
              compact
            />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={Link2}
          disabled={user.is_permanent || !user.is_active}
          title={user.is_permanent ? t('recovery.admin.ownerOnServer') : undefined}
          onClick={() => setLinkOpen(true)}
        >
          {t('pages.adminUsers.resetLink')}
        </Button>
        <label htmlFor={roleSelectId} className="sr-only">
          {t('pages.adminUsers.roleOf', { name: user.display_name })}
        </label>
        <select
          id={roleSelectId}
          value={currentRole}
          disabled={update.isPending || user.is_permanent}
          onChange={(e) => {
            const next = e.target.value as SystemRoleChoice
            if (next !== currentRole) setPendingRole(next)
          }}
          className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm"
        >
          {ROLE_CHOICES.map((role) => (
            <option key={role} value={role}>
              {t(`codes.systemRole.${role}`)}
            </option>
          ))}
        </select>
        {user.is_active ? (
          <Button
            variant="ghost"
            disabled={update.isPending || isMe || user.is_permanent}
            onClick={() => setConfirmDeactivate(true)}
          >
            {t('pages.adminUsers.deactivate')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled={update.isPending}
            onClick={() => update.mutate({ is_active: true })}
          >
            {t('pages.adminUsers.activate')}
          </Button>
        )}
      </div>
      <ResetLinkDialog
        open={linkOpen}
        user={user}
        activeLink={user.reset_link}
        onClose={() => setLinkOpen(false)}
      />
      <ConfirmDialog
        open={pendingRole !== null}
        title={t('pages.adminUsers.roleChangeTitle', {
          name: user.display_name,
          role: pendingRole ? t(`codes.systemRole.${pendingRole}`) : '',
        })}
        body={pendingRole ? t(`codes.systemRoleHelp.${pendingRole}`) : ''}
        confirmLabel={t('pages.adminUsers.roleChange')}
        tone="primary"
        busy={update.isPending}
        onConfirm={() => pendingRole && update.mutate({ system_role: pendingRole })}
        onCancel={() => setPendingRole(null)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        title={t('pages.adminUsers.deactivateTitle', { name: user.display_name })}
        body={t('pages.adminUsers.deactivateBody')}
        confirmLabel={t('pages.adminUsers.deactivate')}
        busy={update.isPending}
        onConfirm={() => update.mutate({ is_active: false })}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </li>
  )
}

export function AdminUsersPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const [q, setQ] = useState('')
  const isSuperAdmin = Boolean(me.data?.is_super_admin)
  const users = useAdminUsers(q, isSuperAdmin)

  if (!isSuperAdmin) return <NotFoundPage reason="item" />
  return (
    <>
      <PageHeader title={t('pages.adminUsers.title')} subtitle={t('pages.adminUsers.subtitle')} />
      <div className="space-y-6">
        <Section title={t('pages.adminUsers.create')}>
          <CreateUserForm />
        </Section>
        <Section>
          <FilterBar>
            <SearchField
              label={t('filters.keyword')}
              placeholder={t('pages.adminUsers.search')}
              value={q}
              onSearch={setQ}
            />
          </FilterBar>
          {users.isPending && <LoadingState rows={4} />}
          {users.isError && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}
          {users.isSuccess && users.data.length === 0 && (
            <EmptyState filtered description={t('pages.adminUsers.empty')} />
          )}
          {users.isSuccess && users.data.length > 0 && (
            <ul className="divide-y divide-line">
              {users.data.map((user) => (
                <UserRow key={user.id} user={user} isMe={user.id === me.data?.id} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
