import {
  uatParticipantsAddSchema,
  type UatDetailDto,
  type UatParticipantDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure, useUatParticipants } from '../../hooks/structure-queries'
import { useWorkshopTables } from '../../hooks/workshop-queries'
import { apiErrorText } from '../../lib/api-errors'
import { groupLabel, parsePeople } from '../../lib/uat'
import { useDataSource } from '../../services/use-data-source'
import { ActivationLinkDialog } from '../members/ActivationLinkDialog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { FormAlert, SelectField, TextArea } from '../ui/Form'
import { Section } from '../ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../ui/States'
import { useToast } from '../ui/toast-context'

const NO_GROUP = ''

function AddPeople({
  code,
  uat,
  groups,
}: {
  code: string
  uat: UatDetailDto
  groups: { id: string; label: string }[]
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [groupId, setGroupId] = useState(NO_GROUP)
  const [error, setError] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: (people: { name: string; email: string | null; group_id?: string | null }[]) =>
      ds.addUatParticipants(code, uat.id, { people }),
    onSuccess: async (_saved, people) => {
      setText('')
      await invalidateStructure(queryClient, code)
      toast.show(t('uat.people.added', { count: people.length }))
    },
    onError: (e) => setError(apiErrorText(t, e)),
  })
  const submit = () => {
    setError(null)
    const people = parsePeople(text).map((p) => ({
      ...p,
      ...(groupId ? { group_id: groupId } : {}),
    }))
    if (people.length === 0) {
      setError(t('uat.people.empty'))
      return
    }
    const parsed = uatParticipantsAddSchema.safeParse({ people })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const row = typeof issue?.path[1] === 'number' ? issue.path[1] + 1 : null
      setError(
        issue?.message === 'DUPLICATE_NAME' || issue?.message === 'DUPLICATE_EMAIL'
          ? t('uat.people.duplicate', { row })
          : t('uat.people.invalidRow', { row }),
      )
      return
    }
    add.mutate(people)
  }
  return (
    <Section title={t('uat.people.addTitle')} description={t('uat.people.addHint')}>
      <div className="space-y-4">
        <TextArea
          label={t('uat.people.list')}
          required
          rows={5}
          value={text}
          placeholder={t('uat.people.listPlaceholder')}
          hint={t('uat.people.listHint')}
          onChange={(e) => setText(e.target.value)}
        />
        {groups.length > 0 && (
          <SelectField
            label={t('uat.people.intoGroup')}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            options={[
              { value: NO_GROUP, label: t('uat.people.noGroup') },
              ...groups.map((g) => ({ value: g.id, label: g.label })),
            ]}
          />
        )}
        <FormAlert message={error} />
        <Button icon={UserPlus} loading={add.isPending} onClick={submit}>
          {t('uat.people.add')}
        </Button>
      </div>
    </Section>
  )
}

/**
 * Pengguna UAT (ADR 0019): the people who test in this UAT, each optionally in a group
 * (kelompok) with a table number. Someone with an e-mail gets an account and finds this UAT
 * under "UAT saya"; someone without one works with the group's card.
 */
export function ParticipantsTab({ code, uat }: { code: string; uat: UatDetailDto }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const people = useUatParticipants(code, uat.id)
  const tables = useWorkshopTables(code, uat.id)
  const groups = (tables.data ?? []).map((g) => ({ id: g.id, label: groupLabel(t, g) }))
  const [removing, setRemoving] = useState<UatParticipantDto | null>(null)
  const [activation, setActivation] = useState<UatParticipantDto | null>(null)

  const move = useMutation({
    mutationFn: (input: { person: UatParticipantDto; group_id: string | null }) =>
      ds.updateUatParticipant(code, uat.id, input.person.id, { group_id: input.group_id }),
    onSuccess: async (saved) => {
      await invalidateStructure(queryClient, code)
      toast.show(
        saved.group
          ? t('uat.people.moved', { name: saved.name, group: groupLabel(t, saved.group) })
          : t('uat.people.ungrouped', { name: saved.name }),
      )
    },
    onError: (e) => toast.show(apiErrorText(t, e), 'error'),
  })
  const remove = useMutation({
    mutationFn: (person: UatParticipantDto) => ds.removeUatParticipant(code, uat.id, person.id),
    onSuccess: async (_r, person) => {
      setRemoving(null)
      await invalidateStructure(queryClient, code)
      toast.show(t('uat.people.removed', { name: person.name }))
    },
    onError: (e) => {
      setRemoving(null)
      toast.show(apiErrorText(t, e), 'error')
    },
  })

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Section
        title={t('uat.people.title', { count: people.data?.length ?? 0 })}
        description={t('uat.people.intro')}
      >
        {people.isPending && <LoadingState rows={4} />}
        {people.isError && (
          <ErrorState error={people.error} onRetry={() => void people.refetch()} />
        )}
        {people.isSuccess && people.data.length === 0 && (
          <EmptyState description={t('uat.people.none')} />
        )}
        {people.isSuccess && people.data.length > 0 && (
          <ul className="divide-y divide-line" aria-label={t('uat.people.listLabel')}>
            {people.data.map((person) => (
              <li
                key={person.id}
                className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-semibold break-words">{person.name}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    {person.email ?? t('uat.people.noEmail')}
                    {person.account === 'ACTIVE' && (
                      <Badge tone="success" label={t('workshop.tables.accountActive')} />
                    )}
                    {person.account === 'NOT_ACTIVATED' && (
                      <Badge tone="warning" label={t('uat.people.notActivated')} />
                    )}
                  </p>
                </div>
                <label className="sr-only" htmlFor={`group-${person.id}`}>
                  {t('uat.people.groupOf', { name: person.name })}
                </label>
                <select
                  id={`group-${person.id}`}
                  className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm"
                  value={person.group?.id ?? NO_GROUP}
                  disabled={move.isPending}
                  onChange={(e) => move.mutate({ person, group_id: e.target.value || null })}
                >
                  <option value={NO_GROUP}>{t('uat.people.noGroup')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1">
                  {person.account === 'NOT_ACTIVATED' && person.user_id && (
                    <Button variant="ghost" icon={KeyRound} onClick={() => setActivation(person)}>
                      {t('workshop.tables.activationLink')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    aria-label={t('uat.people.remove', { name: person.name })}
                    onClick={() => setRemoving(person)}
                  >
                    <span className="sr-only sm:not-sr-only">{t('actions.remove')}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <AddPeople code={code} uat={uat} groups={groups} />
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? t('uat.people.removeTitle', { name: removing.name }) : ''}
        body={t('uat.people.removeBody')}
        confirmLabel={t('actions.remove')}
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onCancel={() => setRemoving(null)}
      />
      {activation?.user_id && (
        <ActivationLinkDialog
          code={code}
          userId={activation.user_id}
          name={activation.name}
          onClose={() => setActivation(null)}
        />
      )}
    </div>
  )
}
