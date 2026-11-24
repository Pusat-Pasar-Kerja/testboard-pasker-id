import type {
  UatFeatureAssignmentDto,
  UatParticipantDto,
  WorkshopTableDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { User, UsersRound, X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure } from '../../hooks/structure-queries'
import { apiErrorText } from '../../lib/api-errors'
import { groupLabel } from '../../lib/uat'
import { useDataSource } from '../../services/use-data-source'
import { useToast } from '../ui/toast-context'

/**
 * "Ditugaskan ke" for one feature of a UAT (owner, 2026-11-24): groups (with their table
 * number) and people by name, as many as needed. Only those listed work on the feature.
 * Adding or removing saves at once.
 */
export function FeatureAssignees({
  code,
  uatId,
  assignment,
  groups,
  people,
  canManage,
}: {
  code: string
  uatId: string
  assignment: UatFeatureAssignmentDto
  groups: WorkshopTableDto[]
  people: UatParticipantDto[]
  canManage: boolean
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const selectId = useId()
  const feature = assignment.module.name
  const groupIds = assignment.groups.map((g) => g.id)
  const memberIds = assignment.people.map((p) => p.id)
  const save = useMutation({
    mutationFn: (next: { group_ids: string[]; member_ids: string[]; done: string }) =>
      ds.setFeatureAssignees(code, uatId, assignment.module.id, {
        group_ids: next.group_ids,
        member_ids: next.member_ids,
      }),
    onSuccess: async (_saved, next) => {
      await invalidateStructure(queryClient, code)
      toast.show(next.done)
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  const freeGroups = groups.filter((g) => !groupIds.includes(g.id))
  const freePeople = people.filter((p) => !memberIds.includes(p.id))
  const empty = assignment.groups.length === 0 && assignment.people.length === 0

  const add = (value: string) => {
    const [kind, id] = value.split(':')
    if (!id) return
    if (kind === 'g') {
      const group = groups.find((g) => g.id === id)
      save.mutate({
        group_ids: [...groupIds, id],
        member_ids: memberIds,
        done: t('uat.assign.added', { name: group ? groupLabel(t, group) : '', feature }),
      })
    } else {
      const person = people.find((p) => p.id === id)
      save.mutate({
        group_ids: groupIds,
        member_ids: [...memberIds, id],
        done: t('uat.assign.added', { name: person?.name ?? '', feature }),
      })
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink-muted">{t('uat.assign.title')}</p>
      {empty ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('uat.assign.none')}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={t('uat.assign.listOf', { feature })}>
          {assignment.groups.map((group) => {
            const name = groupLabel(t, group)
            return (
              <li
                key={`g${group.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm font-medium text-brand-800 ring-1 ring-brand-100"
              >
                <UsersRound aria-hidden="true" className="size-4" />
                <span>{name}</span>
                {canManage && (
                  <button
                    type="button"
                    disabled={save.isPending}
                    aria-label={t('uat.assign.remove', { name, feature })}
                    onClick={() =>
                      save.mutate({
                        group_ids: groupIds.filter((id) => id !== group.id),
                        member_ids: memberIds,
                        done: t('uat.assign.removed', { name, feature }),
                      })
                    }
                    className="inline-flex size-7 items-center justify-center rounded-full hover:bg-brand-100"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </li>
            )
          })}
          {assignment.people.map((person) => (
            <li
              key={`p${person.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-teal-50 py-1 pr-1 pl-3 text-sm font-medium text-teal-700 ring-1 ring-teal-100"
            >
              <User aria-hidden="true" className="size-4" />
              <span>{person.name}</span>
              {canManage && (
                <button
                  type="button"
                  disabled={save.isPending}
                  aria-label={t('uat.assign.remove', { name: person.name, feature })}
                  onClick={() =>
                    save.mutate({
                      group_ids: groupIds,
                      member_ids: memberIds.filter((id) => id !== person.id),
                      done: t('uat.assign.removed', { name: person.name, feature }),
                    })
                  }
                  className="inline-flex size-7 items-center justify-center rounded-full hover:bg-teal-100"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (freeGroups.length > 0 || freePeople.length > 0) && (
        <div className="max-w-sm">
          <label htmlFor={selectId} className="sr-only">
            {t('uat.assign.addLabel', { feature })}
          </label>
          <select
            id={selectId}
            value=""
            disabled={save.isPending}
            onChange={(e) => add(e.target.value)}
            className="min-h-10 w-full rounded-lg border border-dashed border-brand-300 bg-surface px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <option value="">{t('uat.assign.add')}</option>
            {freeGroups.length > 0 && (
              <optgroup label={t('uat.assign.groups')}>
                {freeGroups.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>
                    {groupLabel(t, g)}
                  </option>
                ))}
              </optgroup>
            )}
            {freePeople.length > 0 && (
              <optgroup label={t('uat.assign.people')}>
                {freePeople.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>
                    {p.group ? `${p.name} (${groupLabel(t, p.group)})` : p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}
      {canManage && groups.length === 0 && people.length === 0 && (
        <p className="text-sm text-ink-muted">{t('uat.assign.nobody')}</p>
      )}
    </div>
  )
}
