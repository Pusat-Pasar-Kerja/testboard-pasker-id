import type { AdminUserDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ShieldCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

function message(t: TFunction, error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return error.details[0] ? t('form.alreadyUsed') : error.message
    return error.status === 422 ? t('form.invalid') : t(`errors.${error.code}`)
  }
  return t('errors.INTERNAL_ERROR')
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
  const [superAdmin, setSuperAdmin] = useState(false)
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  const create = useMutation({
    mutationFn: () =>
      ds.createUser({ email: email.trim(), display_name: name.trim(), is_super_admin: superAdmin }),
    onSuccess: async (result) => {
      setEmail('')
      setName('')
      setSuperAdmin(false)
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
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={superAdmin}
            onChange={(e) => setSuperAdmin(e.target.checked)}
            className="size-5 accent-brand-700"
          />
          {t('pages.adminUsers.superAdminLabel')}
        </label>
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

  const update = useMutation({
    mutationFn: (input: { is_active?: boolean; is_super_admin?: boolean }) =>
      ds.updateUser(user.id, input),
    onSuccess: async (updated) => {
      setConfirmDeactivate(false)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      if (isMe) await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast.show(t('pages.adminUsers.updated', { name: updated.display_name }))
    },
    onError: (error) => {
      setConfirmDeactivate(false)
      toast.show(message(t, error), 'error')
    },
  })

  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {user.display_name}
          {user.is_super_admin && (
            <Badge tone="brand" icon={ShieldCheck} label={t('shell.superAdmin')} />
          )}
          <Badge
            tone={user.is_active ? 'success' : 'muted'}
            label={user.is_active ? t('pages.adminUsers.active') : t('pages.adminUsers.inactive')}
          />
        </p>
        <p className="truncate text-xs text-ink-muted">{user.email}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() => update.mutate({ is_super_admin: !user.is_super_admin })}
        >
          {user.is_super_admin
            ? t('pages.adminUsers.revokeSuperAdmin')
            : t('pages.adminUsers.grantSuperAdmin')}
        </Button>
        {user.is_active ? (
          <Button
            variant="ghost"
            disabled={update.isPending || isMe}
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
