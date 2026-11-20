import { MEMBER_ROLES, type MemberDto, type MemberRole } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserMinus, UserPlus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCurrentUser, useMembers } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { useDataSource } from '../services/use-data-source'

/** Two-tab link bar shared by the Team & Settings pages. */
export function TeamTabs({ code }: { code: string }) {
  const { t } = useTranslation()
  const cls = ({ isActive }: { isActive: boolean }) =>
    `-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${
      isActive
        ? 'border-brand-600 text-brand-700'
        : 'border-transparent text-ink-muted hover:text-ink'
    }`
  return (
    <nav aria-label={t('pages.members.title')} className="mb-6 flex gap-1 border-b border-line">
      <NavLink to={projectPath(code, 'members')} className={cls}>
        {t('nav.members')}
      </NavLink>
      <NavLink to={projectPath(code, 'settings')} className={cls}>
        {t('nav.settings')}
      </NavLink>
    </nav>
  )
}

function AddMemberForm({ code }: { code: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('TESTER')
  const add = useMutation({
    mutationFn: () => ds.addMember(code, { email: email.trim(), role_code: role }),
    onSuccess: async (member) => {
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      toast.show(
        t('pages.members.added', {
          name: member.user.display_name,
          role: t(`codes.role.${member.role_code}`),
        }),
      )
    },
  })
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (email.trim()) add.mutate()
      }}
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
    >
      <TextField
        label={t('fields.email')}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint={t('pages.members.emailHint')}
      />
      <SelectField
        label={t('fields.role')}
        required
        value={role}
        onChange={(e) => setRole(e.target.value as MemberRole)}
        options={MEMBER_ROLES.map((r) => ({ value: r, label: t(`codes.role.${r}`) }))}
        className="sm:pb-5"
      />
      <Button type="submit" icon={UserPlus} loading={add.isPending} className="sm:mb-5">
        {t('actions.add')}
      </Button>
      <div className="sm:col-span-3">
        <FormAlert message={add.isError ? apiErrorText(t, add.error) : null} />
      </div>
    </form>
  )
}

function MemberRow({
  code,
  member,
  manage,
  isMe,
}: {
  code: string
  member: MemberDto
  manage: boolean
  isMe: boolean
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const selectId = useId()
  const [confirm, setConfirm] = useState(false)
  const name = member.user.display_name
  const onError = (error: unknown) => toast.show(apiErrorText(t, error), 'error')

  const changeRole = useMutation({
    mutationFn: (role: MemberRole) => ds.updateMember(code, member.user.id, role),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      await queryClient.invalidateQueries({ queryKey: ['project', code] })
      toast.show(
        t('pages.members.roleChanged', { name, role: t(`codes.role.${updated.role_code}`) }),
      )
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: () => ds.removeMember(code, member.user.id),
    onSuccess: async () => {
      setConfirm(false)
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      toast.show(t('pages.members.removed', { name }))
    },
    onError: (error) => {
      setConfirm(false)
      onError(error)
    },
  })

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {name}
          {isMe && <Badge tone="brand" label={t('pages.members.you')} />}
          {!member.user.is_active && <Badge tone="muted" label={t('pages.members.inactive')} />}
        </p>
        <p className="truncate text-xs text-ink-muted">{member.user.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {manage ? (
          <>
            <label htmlFor={selectId} className="sr-only">
              {t('pages.members.roleLabel', { name })}
            </label>
            <select
              id={selectId}
              value={member.role_code}
              disabled={changeRole.isPending}
              onChange={(e) => changeRole.mutate(e.target.value as MemberRole)}
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm"
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`codes.role.${r}`)}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              icon={UserMinus}
              onClick={() => setConfirm(true)}
              aria-label={`${t('actions.remove')} ${name}`}
            >
              <span className="hidden sm:inline">{t('actions.remove')}</span>
            </Button>
          </>
        ) : (
          <Badge tone="neutral" label={t(`codes.role.${member.role_code}`)} />
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('pages.members.removeTitle', { name })}
        body={t('pages.members.removeBody')}
        confirmLabel={t('actions.remove')}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  )
}

export function MembersPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const me = useCurrentUser()
  const members = useMembers(code)
  const manage = can('member.manage')

  return (
    <>
      <PageHeader
        title={t('pages.members.title')}
        subtitle={t('pages.members.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.members.title') }]}
      />
      <TeamTabs code={code} />
      <div className="space-y-6">
        {manage ? (
          <Section title={t('pages.members.addTitle')}>
            <AddMemberForm code={code} />
          </Section>
        ) : (
          <p className="text-sm text-ink-muted">{t('pages.members.readOnly')}</p>
        )}
        <Section>
          {members.isPending && <LoadingState rows={4} />}
          {members.isError && (
            <ErrorState error={members.error} onRetry={() => void members.refetch()} />
          )}
          {members.isSuccess && members.data.length === 0 && (
            <EmptyState description={t('states.emptyTitle')} />
          )}
          {members.isSuccess && members.data.length > 0 && (
            <ul className="divide-y divide-line">
              {members.data.map((member) => (
                <MemberRow
                  key={member.user.id}
                  code={code}
                  member={member}
                  manage={manage}
                  isMe={member.user.id === me.data?.id}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
