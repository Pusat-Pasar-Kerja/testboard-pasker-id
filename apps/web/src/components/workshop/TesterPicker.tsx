import type { TableSessionMember } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, LockKeyhole, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { useTesterName } from './use-tester-name'
import { useDataSource } from '../../services/use-data-source'
import { ApiClientError } from '../../services/api-client'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { apiErrorText } from '../../lib/api-errors'

/**
 * The names of this table. People an Admin listed with an e-mail (they have an account)
 * stay as they are; the table can add or remove the other names.
 */
function MembersDialog({
  members,
  onClose,
}: {
  members: TableSessionMember[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const fixed = members.filter((m) => m.account !== 'NONE')
  const [list, setList] = useState(members.filter((m) => m.account === 'NONE').map((m) => m.name))
  const [draft, setDraft] = useState('')
  const save = useMutation({
    mutationFn: (names: string[]) => ds.updateWorkshopMembers(names),
    onSuccess: (session) => {
      queryClient.setQueryData(['workshop', 'session'], session)
      onClose()
    },
  })
  const taken = (value: string) =>
    [...fixed.map((m) => m.name), ...list].some(
      (name) => name.toLocaleLowerCase('id') === value.toLocaleLowerCase('id'),
    )
  const add = (event?: FormEvent) => {
    event?.preventDefault()
    const value = draft.trim()
    if (value && !taken(value)) setList([...list, value])
    setDraft('')
  }
  return (
    <FormDialog
      open
      title={t('easy.members.title')}
      description={t('easy.members.hint')}
      submitLabel={t('easy.members.save')}
      busy={save.isPending}
      onSubmit={() => {
        const value = draft.trim()
        save.mutate(value && !taken(value) ? [...list, value] : list)
      }}
      onCancel={onClose}
    >
      <ul className="space-y-2">
        {fixed.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-lg"
          >
            <span>{member.name}</span>
            <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
              <LockKeyhole aria-hidden="true" className="size-4" />
              {t('easy.members.hasAccount')}
            </span>
          </li>
        ))}
        {list.map((member) => (
          <li
            key={member}
            className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-lg"
          >
            <span>{member}</span>
            <button
              type="button"
              onClick={() => setList(list.filter((m) => m !== member))}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t('easy.members.remove', { name: member })}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{t('easy.members.newName')}</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            maxLength={100}
            placeholder={t('easy.members.newName')}
            className="min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-lg"
          />
        </label>
        <button
          type="button"
          onClick={() => add()}
          className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-line-strong px-4 font-semibold hover:bg-neutral-soft"
        >
          <Plus aria-hidden="true" className="size-5" />
          {t('easy.members.add')}
        </button>
      </div>
      <FormAlert message={save.isError ? apiErrorText(t, save.error) : null} />
    </FormDialog>
  )
}

/**
 * "Aktifkan akun saya" (ADR 0018): a person an Admin listed with an e-mail chooses their own
 * password here, once. They can then sign in with that e-mail anywhere.
 */
function ActivateDialog({
  members,
  onClose,
}: {
  members: TableSessionMember[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const waiting = members.filter((m) => m.account === 'NOT_ACTIVATED')
  const [chosen, setChosen] = useState<TableSessionMember | null>(
    waiting.length === 1 ? (waiting[0] ?? null) : null,
  )
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const activate = useMutation({
    mutationFn: () => ds.activateTableMember(chosen?.id ?? '', password),
    onSuccess: (session) => {
      queryClient.setQueryData(['workshop', 'session'], session)
      setDone(true)
    },
    onError: (error) => {
      const field = error instanceof ApiClientError ? error.details[0]?.message : undefined
      setProblem(
        field === 'ALREADY_ACTIVE' ? t('easy.activate.alreadyActive') : apiErrorText(t, error),
      )
    },
  })

  if (done && chosen) {
    return (
      <FormDialog
        open
        title={t('easy.activate.doneTitle')}
        description={t('easy.activate.doneBody', { email: chosen.email_hint ?? '' })}
        submitLabel={t('actions.close')}
        hideCancel
        onSubmit={onClose}
        onCancel={onClose}
      >
        <p className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-success">
          <Check aria-hidden="true" className="size-5" />
          {t('easy.activate.doneNote')}
        </p>
      </FormDialog>
    )
  }

  return (
    <FormDialog
      open
      title={t('easy.activate.title')}
      description={t('easy.activate.intro')}
      submitLabel={t('easy.activate.submit')}
      busy={activate.isPending}
      onSubmit={() => {
        setProblem(null)
        if (!chosen) return setProblem(t('easy.activate.chooseFirst'))
        if (password.length < 8) return setProblem(t('easy.activate.tooShort'))
        if (password !== repeat) return setProblem(t('easy.activate.mismatch'))
        activate.mutate()
      }}
      onCancel={onClose}
    >
      <fieldset>
        <legend className="text-lg font-semibold">{t('easy.activate.who')}</legend>
        <div className="mt-2 flex flex-col gap-2">
          {waiting.map((member) => (
            <label
              key={member.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 text-lg ${
                chosen?.id === member.id ? 'border-brand-600 bg-brand-50' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="activate-member"
                checked={chosen?.id === member.id}
                onChange={() => setChosen(member)}
                className="size-5 accent-brand-700"
              />
              <span>
                <span className="block font-semibold">{member.name}</span>
                {member.email_hint && (
                  <span className="block text-sm text-ink-muted">{member.email_hint}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="block text-lg font-semibold">{t('easy.activate.password')}</span>
        <span className="block text-sm text-ink-muted">{t('easy.activate.passwordHint')}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-lg"
        />
      </label>
      <label className="block">
        <span className="block text-lg font-semibold">{t('easy.activate.repeat')}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          className="mt-1 block min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-lg"
        />
      </label>
      <FormAlert message={problem} />
    </FormDialog>
  )
}

/** Big name buttons: tap who is answering on this device; edit the table's members. */
export function TesterPicker({
  members,
  tester,
}: {
  members: TableSessionMember[]
  tester: ReturnType<typeof useTesterName>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [activating, setActivating] = useState(false)
  const canActivate = members.some((m) => m.account === 'NOT_ACTIVATED')
  return (
    <section
      aria-labelledby="yang-mengisi"
      className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="yang-mengisi" className="flex items-center gap-2 text-lg font-semibold">
          <UserRound aria-hidden="true" className="size-5 text-brand-700" />
          {t('easy.tester.title')}
        </h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Pencil aria-hidden="true" className="size-4" />
          {t('easy.tester.edit')}
        </button>
      </div>
      {members.length === 0 ? (
        <p className="mt-2 text-ink-muted">{t('easy.tester.noMembers')}</p>
      ) : (
        <div role="radiogroup" aria-labelledby="yang-mengisi" className="mt-3 flex flex-wrap gap-2">
          {members.map(({ id, name }) => {
            const active = tester.name === name
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => tester.choose(active ? null : name)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-lg font-semibold transition-colors ${
                  active
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'border border-line-strong bg-surface text-ink hover:bg-neutral-soft'
                }`}
              >
                {active && <Check aria-hidden="true" className="size-5" />}
                {name}
              </button>
            )
          })}
        </div>
      )}
      {canActivate && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">{t('easy.activate.offer')}</p>
          <button
            type="button"
            onClick={() => setActivating(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 font-semibold text-brand-800 hover:bg-brand-100"
          >
            <KeyRound aria-hidden="true" className="size-5" />
            {t('easy.activate.open')}
          </button>
        </div>
      )}
      {editing && <MembersDialog members={members} onClose={() => setEditing(false)} />}
      {activating && <ActivateDialog members={members} onClose={() => setActivating(false)} />}
    </section>
  )
}
