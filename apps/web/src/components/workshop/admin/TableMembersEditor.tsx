import type { TableMemberAccount } from '@testboard/shared'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivationLinkDialog } from '../../members/ActivationLinkDialog'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'

export interface MemberRowState {
  name: string
  email: string
  /** Known after saving: whether the e-mail already belongs to an activated account. */
  account?: TableMemberAccount
  userId?: string | null
}

const MAX_MEMBERS = 30

/**
 * People at one table (ADR 0018): a name each, and optionally an e-mail. An e-mail makes the
 * person a User account (Penguji) they activate later; participants never type e-mails.
 */
export function TableMembersEditor({
  code,
  rows,
  onChange,
}: {
  code: string
  rows: MemberRowState[]
  onChange: (rows: MemberRowState[]) => void
}) {
  const { t } = useTranslation()
  const [linkFor, setLinkFor] = useState<{ userId: string; name: string } | null>(null)
  const update = (index: number, patch: Partial<MemberRowState>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{t('workshop.tables.members')}</legend>
      <p className="text-sm text-ink-muted">{t('workshop.tables.membersHint')}</p>
      {rows.length > 0 && (
        <ol className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={index}
              className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
            >
              <label className="block text-sm">
                <span className="font-medium">
                  {t('workshop.tables.memberName', { n: index + 1 })}
                </span>
                <input
                  value={row.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  maxLength={100}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">{t('workshop.tables.memberEmail')}</span>
                <input
                  type="email"
                  inputMode="email"
                  value={row.email}
                  onChange={(e) =>
                    update(index, { email: e.target.value, account: undefined, userId: undefined })
                  }
                  placeholder={t('workshop.tables.memberEmailPlaceholder')}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {row.account === 'ACTIVE' && (
                  <Badge tone="success" label={t('workshop.tables.accountActive')} />
                )}
                {row.account === 'NOT_ACTIVATED' && row.userId && (
                  <Button
                    variant="secondary"
                    icon={KeyRound}
                    onClick={() => setLinkFor({ userId: row.userId as string, name: row.name })}
                  >
                    {t('workshop.tables.activationLink')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label={t('workshop.tables.removeMember', { name: row.name || index + 1 })}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <span className="sr-only sm:not-sr-only">{t('actions.remove')}</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        variant="secondary"
        icon={Plus}
        disabled={rows.length >= MAX_MEMBERS}
        onClick={() => onChange([...rows, { name: '', email: '' }])}
      >
        {t('workshop.tables.addMember')}
      </Button>
      {linkFor && (
        <ActivationLinkDialog
          code={code}
          userId={linkFor.userId}
          name={linkFor.name}
          onClose={() => setLinkFor(null)}
        />
      )}
    </fieldset>
  )
}
