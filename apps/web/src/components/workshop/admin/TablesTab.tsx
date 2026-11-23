import type { CycleDto, WorkshopTableDto, WorkshopTableState } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  CircleCheck,
  FileText,
  KeyRound,
  Pencil,
  Plus,
  Printer,
  Rows3,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useModules, useRun, useRuns } from '../../../hooks/queries'
import { useWorkshopTables } from '../../../hooks/workshop-queries'
import { apiErrorText, apiFieldErrors } from '../../../lib/api-errors'
import { formatShortDateTime, toLocale } from '../../../lib/format'
import { fromLocalInput, spacedCode, toLocalInput } from '../../../lib/workshop'
import { useDataSource } from '../../../services/use-data-source'
import { Badge, type Tone } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/Dialog'
import { FormAlert, SelectField, TextField } from '../../ui/Form'
import { FormDialog } from '../../ui/FormDialog'
import { EmptyState, ErrorState, LoadingState } from '../../ui/States'
import { TableMembersEditor, type MemberRowState } from './TableMembersEditor'
import { useToast } from '../../ui/toast-context'
import { ProgressMeter } from '../ProgressMeter'

const STATE_TONE: Record<WorkshopTableState, Tone> = {
  ACTIVE: 'success',
  NOT_YET: 'info',
  EXPIRED: 'muted',
  REVOKED: 'danger',
}

/** Default card validity: the Fase dates (07.00 - 23.59 local), else now + 2 days. */
function defaultWindow(cycle: CycleDto) {
  const from = cycle.starts_on ? new Date(`${cycle.starts_on}T07:00`) : new Date()
  const until = cycle.ends_on
    ? new Date(`${cycle.ends_on}T23:59`)
    : new Date(Date.now() + 2 * 24 * 3_600_000)
  return {
    from: toLocalInput(from.toISOString()),
    until: toLocalInput(
      (until > new Date() ? until : new Date(Date.now() + 2 * 24 * 3_600_000)).toISOString(),
    ),
  }
}

/** Features (modules) that have scenarios in the chosen run. */
function useRunFeatures(code: string, runId: string) {
  const run = useRun(code, runId, Boolean(runId))
  const modules = useModules(code)
  return useMemo(() => {
    const codes = new Set((run.data?.run_cases ?? []).map((rc) => rc.module_code).filter(Boolean))
    return (modules.data ?? []).filter((m) => codes.has(m.module_code))
  }, [run.data, modules.data])
}

function TableFormDialog({
  code,
  cycle,
  table,
  onClose,
}: {
  code: string
  cycle: CycleDto
  table?: WorkshopTableDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const runs = useRuns(code)
  const cycleRuns = (runs.data ?? []).filter((r) => r.cycle?.id === cycle.id)
  const window = defaultWindow(cycle)
  const [form, setForm] = useState({
    name: table?.name ?? '',
    run_id: table?.run?.id ?? (cycleRuns.length === 1 ? (cycleRuns[0]?.id ?? '') : ''),
    module_ids: table?.modules.map((m) => m.id) ?? [],
    members: (table?.members ?? []).map((m): MemberRowState => ({
      name: m.name,
      email: m.email ?? '',
      account: m.account,
      userId: m.user_id,
    })),
    valid_from: table ? toLocalInput(table.valid_from) : window.from,
    valid_until: table ? toLocalInput(table.valid_until) : window.until,
  })
  const runId = form.run_id || (cycleRuns.length === 1 ? (cycleRuns[0]?.id ?? '') : '')
  const features = useRunFeatures(code, runId)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: form.name.trim(),
        run_id: runId || null,
        module_ids: form.module_ids,
        members: form.members
          .filter((m) => m.name.trim())
          .map((m) => ({ name: m.name.trim(), email: m.email.trim() || null })),
        valid_from: fromLocalInput(form.valid_from),
        valid_until: fromLocalInput(form.valid_until) ?? '',
      }
      return table
        ? ds.updateWorkshopTable(code, cycle.id, table.id, input)
        : ds.createWorkshopTable(code, cycle.id, input)
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['workshop-tables', code, cycle.id] })
      await queryClient.invalidateQueries({ queryKey: ['workshop-board', code, cycle.id] })
      toast.show(
        t(table ? 'workshop.tables.saved' : 'workshop.tables.created', { name: saved.name }),
      )
      onClose()
    },
    onError: (error) => {
      const fields = apiFieldErrors(error)
      setErrors(
        Object.fromEntries(
          Object.keys(fields).map((key) => [
            key,
            key === 'name' ? t('form.alreadyUsed') : t('form.invalid'),
          ]),
        ),
      )
      setAlert(apiErrorText(t, error))
    },
  })

  const submit = () => {
    setAlert(null)
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('form.required')
    if (!fromLocalInput(form.valid_until)) next.valid_until = t('form.required')
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  const toggle = (id: string) =>
    setForm((f) => ({
      ...f,
      module_ids: f.module_ids.includes(id)
        ? f.module_ids.filter((m) => m !== id)
        : [...f.module_ids, id],
    }))

  return (
    <FormDialog
      open
      title={
        table
          ? t('workshop.tables.editTitle', { name: table.name })
          : t('workshop.tables.createTitle')
      }
      description={table ? undefined : t('workshop.tables.createHint')}
      submitLabel={t('actions.save')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label={t('workshop.tables.name')}
        required
        value={form.name}
        maxLength={120}
        placeholder={t('workshop.tables.namePlaceholder')}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
      />
      <SelectField
        label={t('workshop.tables.run')}
        hint={cycleRuns.length === 0 ? t('workshop.tables.noRuns') : t('workshop.tables.runHint')}
        value={runId}
        onChange={(e) => setForm({ ...form, run_id: e.target.value, module_ids: [] })}
        options={[
          { value: '', label: t('workshop.tables.noRun') },
          ...cycleRuns.map((r) => ({ value: r.id, label: `${r.run_code} - ${r.name}` })),
        ]}
        error={errors.run_id}
      />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{t('workshop.tables.features')}</legend>
        {features.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('workshop.tables.featuresEmpty')}</p>
        ) : (
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
            {features.map((m) => (
              <label
                key={m.id}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 hover:bg-neutral-soft"
              >
                <input
                  type="checkbox"
                  className="size-4.5 accent-brand-700"
                  checked={form.module_ids.includes(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span className="text-sm">
                  <span className="font-semibold">{m.module_code}</span> {m.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <TableMembersEditor
        code={code}
        rows={form.members}
        onChange={(members) => setForm({ ...form, members })}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          type="datetime-local"
          label={t('workshop.tables.validFrom')}
          value={form.valid_from}
          onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
        />
        <TextField
          type="datetime-local"
          label={t('workshop.tables.validUntil')}
          required
          value={form.valid_until}
          onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
          error={errors.valid_until}
        />
      </div>
      <FormAlert message={alert} />
    </FormDialog>
  )
}

/** Many tables at once: "Meja 1" ... "Meja N", same run and validity. */
function BulkDialog({
  code,
  cycle,
  existing,
  onClose,
}: {
  code: string
  cycle: CycleDto
  existing: string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const runs = useRuns(code)
  const cycleRuns = (runs.data ?? []).filter((r) => r.cycle?.id === cycle.id)
  const window = defaultWindow(cycle)
  const [count, setCount] = useState('10')
  const [prefix, setPrefix] = useState(t('workshop.tables.defaultPrefix'))
  const [runId, setRunId] = useState(cycleRuns.length === 1 ? (cycleRuns[0]?.id ?? '') : '')
  const [until, setUntil] = useState(window.until)
  const [alert, setAlert] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: async () => {
      const total = Math.min(60, Math.max(1, Number(count) || 0))
      let made = 0
      for (let i = 1; made < total && i < 500; i += 1) {
        const name = `${prefix.trim()} ${i}`
        if (existing.includes(name)) continue
        await ds.createWorkshopTable(code, cycle.id, {
          name,
          run_id: (runId || cycleRuns[0]?.id) ?? null,
          module_ids: [],
          members: [],
          valid_from: fromLocalInput(window.from),
          valid_until: fromLocalInput(until) ?? '',
        })
        made += 1
      }
      return made
    },
    onSuccess: async (made) => {
      await queryClient.invalidateQueries({ queryKey: ['workshop-tables', code, cycle.id] })
      await queryClient.invalidateQueries({ queryKey: ['workshop-board', code, cycle.id] })
      toast.show(t('workshop.tables.bulkDone', { count: made }))
      onClose()
    },
    onError: (error) => setAlert(apiErrorText(t, error)),
  })
  return (
    <FormDialog
      open
      title={t('workshop.tables.bulkTitle')}
      description={t('workshop.tables.bulkHint')}
      submitLabel={t('workshop.tables.bulkSubmit')}
      busy={create.isPending}
      onSubmit={() => create.mutate()}
      onCancel={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('workshop.tables.bulkPrefix')}
          required
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
        />
        <TextField
          label={t('workshop.tables.bulkCount')}
          required
          type="number"
          min={1}
          max={60}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <SelectField
        label={t('workshop.tables.run')}
        value={runId}
        onChange={(e) => setRunId(e.target.value)}
        options={[
          { value: '', label: t('workshop.tables.noRun') },
          ...cycleRuns.map((r) => ({ value: r.id, label: `${r.run_code} - ${r.name}` })),
        ]}
      />
      <TextField
        type="datetime-local"
        label={t('workshop.tables.validUntil')}
        required
        value={until}
        onChange={(e) => setUntil(e.target.value)}
      />
      <FormAlert message={alert} />
    </FormDialog>
  )
}

type Pending = { kind: 'code' | 'revoke' | 'restore' | 'delete'; table: WorkshopTableDto }

/** Tables (meja) of a Fase: cards to print, codes, validity, features and members. */
export function TablesTab({ code, cycle }: { code: string; cycle: CycleDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const tables = useWorkshopTables(code, cycle.id)
  const [dialog, setDialog] = useState<{ table?: WorkshopTableDto } | null>(null)
  const [bulk, setBulk] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const act = useMutation({
    mutationFn: async (p: Pending) => {
      if (p.kind === 'delete') return ds.deleteWorkshopTable(code, cycle.id, p.table.id)
      return ds.updateWorkshopTable(
        code,
        cycle.id,
        p.table.id,
        p.kind === 'code' ? { regenerate_code: true } : { revoked: p.kind === 'revoke' },
      )
    },
    onSuccess: async (_result, p) => {
      setPending(null)
      await queryClient.invalidateQueries({ queryKey: ['workshop-tables', code, cycle.id] })
      await queryClient.invalidateQueries({ queryKey: ['workshop-board', code, cycle.id] })
      toast.show(t(`workshop.tables.done.${p.kind}`, { name: p.table.name }))
    },
    onError: (error) => {
      setPending(null)
      const busy = error && apiFieldErrors(error).table === 'HAS_ACTIVITY'
      toast.show(busy ? t('workshop.tables.hasActivity') : apiErrorText(t, error), 'error')
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-ink-muted">{t('workshop.tables.intro')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Rows3} onClick={() => setBulk(true)}>
            {t('workshop.tables.bulk')}
          </Button>
          <Button icon={Plus} onClick={() => setDialog({})}>
            {t('workshop.tables.create')}
          </Button>
          {(tables.data?.length ?? 0) > 0 && (
            <Link
              to={`/cetak/kartu/${encodeURIComponent(code)}/${cycle.id}`}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-neutral-soft"
            >
              <Printer aria-hidden="true" className="size-4" />
              {t('workshop.tables.printAll')}
            </Link>
          )}
        </div>
      </div>
      {tables.isPending && <LoadingState rows={4} />}
      {tables.isError && <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />}
      {tables.isSuccess && tables.data.length === 0 && (
        <EmptyState description={t('workshop.tables.empty')} />
      )}
      {tables.isSuccess && tables.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {tables.data.map((table) => (
            <li
              key={table.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{table.name}</p>
                  <p className="text-sm text-ink-muted">
                    {table.run
                      ? `${table.run.run_code} - ${table.run.name}`
                      : t('workshop.tables.noRun')}
                  </p>
                </div>
                <Badge
                  tone={STATE_TONE[table.state]}
                  label={t(`workshop.tables.state.${table.state}`)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p>
                  <span className="block text-xs text-ink-muted">{t('workshop.tables.code')}</span>
                  <span className="font-mono text-2xl font-bold tracking-widest">
                    {spacedCode(table.access_code)}
                  </span>
                </p>
                <p className="text-sm text-ink-muted">
                  <Smartphone aria-hidden="true" className="mr-1 inline size-4" />
                  {t('workshop.tables.devices', { count: table.devices })}
                  <br />
                  {t('workshop.tables.until', {
                    date: formatShortDateTime(table.valid_until, locale),
                  })}
                </p>
              </div>
              <p className="text-sm">
                <span className="font-semibold">{t('workshop.tables.features')}: </span>
                {table.modules.map((m) => m.name).join(', ') || t('workshop.tables.noFeatures')}
              </p>
              {table.member_names.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">{t('workshop.tables.members')}: </span>
                  {table.member_names.join(', ')}
                </p>
              )}
              <ProgressMeter counts={table.progress} size="sm" />
              <div className="mt-auto flex flex-wrap gap-1 border-t border-line pt-3">
                <Button variant="ghost" icon={Pencil} onClick={() => setDialog({ table })}>
                  {t('workshop.tables.edit')}
                </Button>
                <Link
                  to={`/cetak/kartu/${encodeURIComponent(code)}/${cycle.id}?meja=${table.id}`}
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  <Printer aria-hidden="true" className="size-4" />
                  {t('workshop.tables.printCard')}
                </Link>
                <Link
                  to={`/cetak/lembar/${encodeURIComponent(code)}/${cycle.id}/${table.id}`}
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  <FileText aria-hidden="true" className="size-4" />
                  {t('workshop.tables.printSheet')}
                </Link>
                <Button
                  variant="ghost"
                  icon={KeyRound}
                  onClick={() => setPending({ kind: 'code', table })}
                >
                  {t('workshop.tables.newCode')}
                </Button>
                {table.state === 'REVOKED' ? (
                  <Button
                    variant="ghost"
                    icon={CircleCheck}
                    onClick={() => setPending({ kind: 'restore', table })}
                  >
                    {t('workshop.tables.restore')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    icon={Ban}
                    onClick={() => setPending({ kind: 'revoke', table })}
                  >
                    {t('workshop.tables.revoke')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setPending({ kind: 'delete', table })}
                >
                  {t('workshop.tables.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <TableFormDialog
          code={code}
          cycle={cycle}
          table={dialog.table}
          onClose={() => setDialog(null)}
        />
      )}
      {bulk && (
        <BulkDialog
          code={code}
          cycle={cycle}
          existing={(tables.data ?? []).map((x) => x.name)}
          onClose={() => setBulk(false)}
        />
      )}
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? t(`workshop.tables.confirm.${pending.kind}.title`, { name: pending.table.name })
            : ''
        }
        body={pending ? t(`workshop.tables.confirm.${pending.kind}.body`) : undefined}
        confirmLabel={pending ? t(`workshop.tables.confirm.${pending.kind}.action`) : ''}
        tone={pending?.kind === 'restore' ? 'primary' : 'danger'}
        busy={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
