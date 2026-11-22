import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { useTesterName } from './use-tester-name'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { apiErrorText } from '../../lib/api-errors'

function MembersDialog({ names, onClose }: { names: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const [list, setList] = useState(names)
  const [draft, setDraft] = useState('')
  const save = useMutation({
    mutationFn: () => ds.updateWorkshopMembers(list),
    onSuccess: (session) => {
      queryClient.setQueryData(['workshop', 'session'], session)
      onClose()
    },
  })
  const add = (event?: FormEvent) => {
    event?.preventDefault()
    const value = draft.trim()
    if (value && !list.includes(value)) setList([...list, value])
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
        if (draft.trim()) add()
        save.mutate()
      }}
      onCancel={onClose}
    >
      <ul className="space-y-2">
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

/** Big name buttons: tap who is answering on this device; edit the table's members. */
export function TesterPicker({
  members,
  tester,
}: {
  members: string[]
  tester: ReturnType<typeof useTesterName>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
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
          {members.map((member) => {
            const active = tester.name === member
            return (
              <button
                key={member}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => tester.choose(active ? null : member)}
                className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-lg font-semibold transition-colors ${
                  active
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'border border-line-strong bg-surface text-ink hover:bg-neutral-soft'
                }`}
              >
                {active && <Check aria-hidden="true" className="size-5" />}
                {member}
              </button>
            )
          })}
        </div>
      )}
      {editing && <MembersDialog names={members} onClose={() => setEditing(false)} />}
    </section>
  )
}
