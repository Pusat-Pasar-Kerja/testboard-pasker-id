import { MEMBER_TASKS, type MemberDto, type MemberRole, type MemberTask } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Info, KeyRound, UserMinus, UserPlus, type LucideIcon } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { ActivationLinkDialog } from '../components/members/ActivationLinkDialog'
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
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

const isTask = (role: MemberRole): role is MemberTask =>
  (MEMBER_TASKS as readonly MemberRole[]).includes(role)

const TASK_ICONS: Record<MemberTask, LucideIcon> = {
  TESTER: FlaskConical,
}

/** Two-tab link bar shared by the members and project settings pages. */
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

/** The three tasks a User can have, explained in one line each. */
function TaskGuide() {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink-muted">{t('pages.members.tasksTitle')}</h2>
      <ul className="mt-2 grid gap-3 md:grid-cols-3">
        {MEMBER_TASKS.map((task) => {
          const Icon = TASK_ICONS[task]
          return (
            <li key={task} className="flex gap-3 rounded-2xl card-pasker p-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl chip-gradient">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{t(`codes.role.${task}`)}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">
                  {t(`codes.roleHelp.${task}`)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AddMemberForm({ code }: { code: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  // Shown once the server says nobody has this e-mail yet.
  const [needsName, setNeedsName] = useState(false)
  const [role, setRole] = useState<MemberTask>('TESTER')
  const add = useMutation({
    mutationFn: () =>
      ds.addMember(code, {
        email: email.trim(),
        ...(needsName && name.trim() ? { display_name: name.trim() } : {}),
        role_code: role,
      }),
    onSuccess: async (member) => {
      setEmail('')
      setName('')
      setNeedsName(false)
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      toast.show(
        t('pages.members.added', {
          name: member.user.display_name,
          role: t(`codes.role.${member.role_code}`),
        }),
      )
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.details[0]?.message === 'NO_ACCOUNT') {
        setNeedsName(true)
      }
    },
  })
  const noAccountError =
    add.error instanceof ApiClientError && add.error.details[0]?.message === 'NO_ACCOUNT'

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (email.trim() && (!needsName || name.trim())) add.mutate()
      }}
      className={`grid grid-cols-1 items-end gap-3 ${
        MEMBER_TASKS.length > 1
          ? 'sm:grid-cols-[minmax(0,1fr)_12rem_auto]'
          : 'sm:grid-cols-[minmax(0,1fr)_auto]'
      }`}
    >
      <TextField
        label={t('fields.email')}
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setNeedsName(false)
        }}
        hint={t('pages.members.emailHint')}
      />
      {/* One kind of member (ADR 0019): nothing to choose. */}
      {MEMBER_TASKS.length > 1 && (
        <SelectField
          label={t('fields.role')}
          required
          value={role}
          onChange={(e) => setRole(e.target.value as MemberTask)}
          options={MEMBER_TASKS.map((r) => ({ value: r, label: t(`codes.role.${r}`) }))}
          className="sm:pb-5"
        />
      )}
      <Button type="submit" icon={UserPlus} loading={add.isPending} className="sm:mb-5">
        {t('actions.add')}
      </Button>
      {needsName && (
        <div className="space-y-2 sm:col-span-full">
          <p className="flex gap-2 rounded-xl bg-pastel-sky p-3 text-sm text-pastel-sky-ink">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('pages.members.nameHint')}
          </p>
          <TextField
            label={t('pages.members.nameLabel')}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}
      <div className="sm:col-span-full">
        <FormAlert message={add.isError && !noAccountError ? apiErrorText(t, add.error) : null} />
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
  const [confirmRemove, setConfirmRemove] = useState(false)
  // A task change is confirmed first (owner audit: nothing changes by accident).
  const [pendingRole, setPendingRole] = useState<MemberTask | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const name = member.user.display_name
  const onError = (error: unknown) => toast.show(apiErrorText(t, error), 'error')

  const changeRole = useMutation({
    mutationFn: (role: MemberTask) => ds.updateMember(code, member.user.id, role),
    onSuccess: async (updated) => {
      setPendingRole(null)
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      await queryClient.invalidateQueries({ queryKey: ['project', code] })
      toast.show(
        t('pages.members.roleChanged', { name, role: t(`codes.role.${updated.role_code}`) }),
      )
    },
    onError: (error) => {
      setPendingRole(null)
      onError(error)
    },
  })
  const remove = useMutation({
    mutationFn: () => ds.removeMember(code, member.user.id),
    onSuccess: async () => {
      setConfirmRemove(false)
      await queryClient.invalidateQueries({ queryKey: ['members', code] })
      toast.show(t('pages.members.removed', { name }))
    },
    onError: (error) => {
      setConfirmRemove(false)
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
          {member.user.is_active && !member.user.has_password && (
            <span title={t('pages.members.notActivatedHint')}>
              <Badge tone="warning" label={t('pages.members.notActivated')} />
            </span>
          )}
        </p>
        <p className="truncate text-xs text-ink-muted">{member.user.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {manage ? (
          <>
            {/* One kind of member only (ADR 0019): a task is chosen only to fix an old role. */}
            {isTask(member.role_code) && MEMBER_TASKS.length === 1 ? (
              <Badge tone="neutral" label={t(`codes.role.${member.role_code}`)} />
            ) : (
              <>
                <label htmlFor={selectId} className="sr-only">
                  {t('pages.members.roleLabel', { name })}
                </label>
                <select
                  id={selectId}
                  value={member.role_code}
                  disabled={changeRole.isPending}
                  onChange={(e) => {
                    const next = e.target.value as MemberRole
                    if (isTask(next) && next !== member.role_code) setPendingRole(next)
                  }}
                  className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm"
                >
                  {!isTask(member.role_code) && (
                    <option value={member.role_code} disabled>
                      {t(`codes.role.${member.role_code}`)}
                    </option>
                  )}
                  {MEMBER_TASKS.map((r) => (
                    <option key={r} value={r}>
                      {t(`codes.role.${r}`)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {member.user.is_active && !member.user.has_password && (
              <Button variant="secondary" icon={KeyRound} onClick={() => setLinkOpen(true)}>
                <span className="hidden sm:inline">{t('workshop.tables.activationLink')}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              icon={UserMinus}
              onClick={() => setConfirmRemove(true)}
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
        open={pendingRole !== null}
        title={t('pages.members.changeTitle', { name })}
        body={
          pendingRole
            ? t('pages.members.changeBody', {
                role: t(`codes.role.${pendingRole}`),
                help: t(`codes.roleHelp.${pendingRole}`),
              })
            : ''
        }
        confirmLabel={t('pages.members.change')}
        tone="primary"
        busy={changeRole.isPending}
        onConfirm={() => pendingRole && changeRole.mutate(pendingRole)}
        onCancel={() => setPendingRole(null)}
      />
      {linkOpen && (
        <ActivationLinkDialog
          code={code}
          userId={member.user.id}
          name={name}
          onClose={() => setLinkOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={t('pages.members.removeTitle', { name })}
        body={t('pages.members.removeBody')}
        confirmLabel={t('actions.remove')}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmRemove(false)}
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
        <TaskGuide />
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
          <p className="mt-4 flex gap-2 border-t border-line pt-4 text-sm text-ink-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('pages.members.adminsNote')}
          </p>
        </Section>
      </div>
    </>
  )
}
