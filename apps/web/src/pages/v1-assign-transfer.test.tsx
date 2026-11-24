import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/**
 * Who works on which feature of a UAT, and moving whole feature folders between Fase like
 * Google Drive (ADR 0020).
 */
function setup(options: { superAdmin?: boolean; userId?: string } = {}) {
  const db = createMockDb()
  if (options.userId) db.currentUserId = options.userId
  const dataSource = createMockDataSource({
    latencyMs: 0,
    db,
    superAdmin: options.superAdmin ?? true,
  })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  const phase = db.cycles.find((c) => c.projectId === project.id)!
  const workshop = db.runs.find((r) => r.projectId === project.id && r.status_code === 'ACTIVE')!
  const moduleOf = (code: string) =>
    db.modules.find((m) => m.projectId === project.id && m.module_code === code)!
  const tableOf = (name: string) =>
    db.tables.find((t) => t.runId === workshop.id && t.name === name)!
  return { db, dataSource, project, phase, workshop, moduleOf, tableOf }
}

/** A stand-in for the browser's DataTransfer (jsdom has none). */
function fakeTransfer() {
  const data: Record<string, string> = {}
  return {
    setData: (type: string, value: string) => {
      data[type] = value
    },
    getData: (type: string) => data[type] ?? '',
    get types() {
      return Object.keys(data)
    },
    effectAllowed: 'all',
    dropEffect: 'none',
  }
}

describe('assigning a feature to groups and people', () => {
  it('adds a group and removes another from the feature card', async () => {
    const user = userEvent.setup()
    const { dataSource, workshop, moduleOf, tableOf } = setup()
    const loker = moduleOf('LOKER')
    renderRoute(`/projects/DEMO-KARIR/uat/${workshop.id}?tab=fitur`, { dataSource })

    const card = (await screen.findByRole('heading', { name: loker.name })).closest(
      'li',
    ) as HTMLElement
    const assigned = await within(card).findByRole('list', {
      name: `Yang ditugaskan untuk ${loker.name}`,
    })
    expect(within(assigned).getByText('Meja 1')).toBeInTheDocument()

    await user.selectOptions(
      within(card).getByLabelText(`Tugaskan kelompok atau pengguna untuk ${loker.name}`),
      `g:${tableOf('Meja 2').id}`,
    )
    expect(await screen.findByText(`Meja 2 ditugaskan ke ${loker.name}.`)).toBeInTheDocument()
    expect(tableOf('Meja 2').moduleIds).toContain(loker.id)

    await user.click(within(card).getByRole('button', { name: `Hapus Meja 1 dari ${loker.name}` }))
    expect(
      await screen.findByText(`Meja 1 tidak lagi ditugaskan ke ${loker.name}.`),
    ).toBeInTheDocument()
    await waitFor(() => expect(tableOf('Meja 1').moduleIds).not.toContain(loker.id))
  })

  it('shows a Pengguna only the features listed for them', async () => {
    const { db, dataSource, workshop, moduleOf } = setup({ superAdmin: false, userId: '3' })
    const loker = moduleOf('LOKER')
    const me = db.participants.find((p) => p.runId === workshop.id && p.userId === '3')!
    // Keep only Lowongan Kerja for this person (the demo gives them every feature).
    for (let i = db.featurePeople.length - 1; i >= 0; i--) {
      const row = db.featurePeople[i]!
      if (row.memberId === me.id && row.moduleId !== loker.id) db.featurePeople.splice(i, 1)
    }
    renderRoute(`/projects/DEMO-KARIR/uat/${workshop.id}`, { dataSource })
    const section = (await screen.findByRole('heading', { name: 'Fitur yang diuji' })).closest(
      'section',
    ) as HTMLElement
    const names = within(section)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')?.textContent)
    expect(names).toEqual([loker.name])
  })
})

describe('moving feature folders between Fase', () => {
  it('moves one feature folder with its button', async () => {
    const user = userEvent.setup()
    const { db, dataSource, phase, moduleOf } = setup()
    const next = await dataSource.createCycle('DEMO-KARIR', {
      cycle_code: 'FASE-2',
      title: 'UAT Tahap 2',
    })
    const loker = moduleOf('LOKER')
    const count = db.cases.filter((c) => c.cycleId === phase.id && c.moduleId === loker.id).length
    renderRoute(`/projects/DEMO-KARIR/fase/${phase.id}`, { dataSource })

    await user.click(
      await screen.findByRole('button', { name: `Salin atau pindahkan ${loker.name}` }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Salin atau pindahkan 1 fitur' })
    await user.click(within(dialog).getByRole('radio', { name: /UAT Tahap 2/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Pindahkan' }))
    expect(
      await screen.findByText(`1 fitur (${count} skenario) dipindahkan ke UAT Tahap 2.`),
    ).toBeInTheDocument()
    expect(
      db.cases.filter((c) => c.moduleId === loker.id).every((c) => c.cycleId === next.id),
    ).toBe(true)
  })

  it('copies several ticked folders at once', async () => {
    const user = userEvent.setup()
    const { db, dataSource, phase, moduleOf } = setup()
    const next = await dataSource.createCycle('DEMO-KARIR', {
      cycle_code: 'FASE-2',
      title: 'UAT Tahap 2',
    })
    const auth = moduleOf('AUTH')
    const lamar = moduleOf('LAMAR')
    renderRoute(`/projects/DEMO-KARIR/fase/${phase.id}`, { dataSource })

    await user.click(await screen.findByRole('checkbox', { name: `Pilih folder ${auth.name}` }))
    await user.click(screen.getByRole('checkbox', { name: `Pilih folder ${lamar.name}` }))
    const bar = await screen.findByRole('region', { name: '2 folder fitur dipilih' })
    await user.click(within(bar).getByRole('button', { name: 'Salin ke Fase…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Salin atau pindahkan 2 fitur' })
    expect(within(dialog).getByRole('radio', { name: 'Salin' })).toBeChecked()
    // "Belum masuk Fase" is only for moving.
    expect(within(dialog).queryByRole('radio', { name: /Belum masuk Fase/ })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: /UAT Tahap 2/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Salin' }))
    expect(
      await screen.findByText(/^2 fitur \(\d+ skenario\) disalin ke UAT Tahap 2\.$/),
    ).toBeInTheDocument()
    const copied = db.cases.filter((c) => c.cycleId === next.id)
    expect(new Set(copied.map((c) => c.moduleId))).toEqual(new Set([auth.id, lamar.id]))
    // The originals stay where they were.
    expect(db.cases.some((c) => c.cycleId === phase.id && c.moduleId === auth.id)).toBe(true)
  })

  it('moves a folder dropped on a Fase in the left panel', async () => {
    const user = userEvent.setup()
    const { db, dataSource, phase, moduleOf } = setup()
    const next = await dataSource.createCycle('DEMO-KARIR', {
      cycle_code: 'FASE-2',
      title: 'UAT Tahap 2',
    })
    const lamar = moduleOf('LAMAR')
    renderRoute(`/projects/DEMO-KARIR/fase/${phase.id}`, { dataSource })

    const folder = (
      await screen.findByRole('checkbox', { name: `Pilih folder ${lamar.name}` })
    ).closest('li') as HTMLElement
    const menu = screen.getByRole('navigation', { name: 'Navigasi utama' })
    const target = (await within(menu).findByRole('link', { name: /UAT Tahap 2/ })).parentElement!
    const transfer = fakeTransfer()
    fireEvent.dragStart(folder, { dataTransfer: transfer })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    fireEvent.drop(target, { dataTransfer: transfer })

    const dialog = await screen.findByRole('dialog', { name: 'Salin atau pindahkan 1 fitur' })
    expect(within(dialog).getByRole('radio', { name: /UAT Tahap 2/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Pindahkan' })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Pindahkan' }))
    await waitFor(() =>
      expect(
        db.cases.filter((c) => c.moduleId === lamar.id).every((c) => c.cycleId === next.id),
      ).toBe(true),
    )
  })
})
