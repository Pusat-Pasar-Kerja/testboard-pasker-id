import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/**
 * The project laid out like Google Drive (ADR 0019): Fase > Fitur > Skenario in the left
 * panel, UATs with their people and groups, and Bug Reporting with its public reports.
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
  return { db, dataSource, project, phase, workshop }
}

describe('Fase > Fitur > Skenario like Google Drive', () => {
  it('opens a Fase folder in the left panel and lists its feature folders', async () => {
    const user = userEvent.setup()
    const { dataSource, phase } = setup()
    renderRoute('/projects/DEMO-KARIR/fase', { dataSource })
    const menu = await screen.findByRole('navigation', { name: 'Navigasi utama' })
    const toggle = await within(menu).findByRole('button', { name: `Buka folder ${phase.title}` })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const features = within(menu).getByRole('list', { name: `Fitur di ${phase.title}` })
    expect(within(features).getByRole('link', { name: /Lowongan Kerja/ })).toBeInTheDocument()

    await user.click(within(features).getByRole('link', { name: /Lowongan Kerja/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lowongan Kerja' }),
    ).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Di ${phase.title}`))).toBeInTheDocument()
    expect((await screen.findAllByText(/^UAT-LOKER-/)).length).toBeGreaterThan(0)
  })

  it('copies a Ready scenario to the next Fase, where it stays Ready', async () => {
    const user = userEvent.setup()
    const { db, dataSource, phase } = setup()
    const next = await dataSource.createCycle('DEMO-KARIR', {
      cycle_code: 'FASE-2',
      title: 'UAT Tahap 2',
    })
    const loker = db.modules.find((m) => m.module_code === 'LOKER')!
    renderRoute(`/projects/DEMO-KARIR/fase/${phase.id}/fitur/${loker.id}`, { dataSource })
    const first = (await screen.findAllByRole('checkbox', { name: /^Pilih UAT-LOKER-/ }))[0]!
    await user.click(first)
    const bar = await screen.findByRole('region', { name: '1 dipilih' })
    await user.click(within(bar).getByRole('button', { name: 'Salin ke Fase…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Salin 1 skenario ke Fase' })
    // Copies need a Fase: "Belum masuk Fase" is not offered.
    expect(within(dialog).queryByRole('radio', { name: /Belum masuk Fase/ })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: /UAT Tahap 2/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Salin' }))
    await waitFor(() => expect(db.cases.filter((c) => c.cycleId === next.id)).toHaveLength(1))
    const copy = db.cases.find((c) => c.cycleId === next.id)!
    expect(copy).toMatchObject({ case_status: 'READY', moduleId: loker.id })
  })
})

describe('UAT: people, groups and table numbers', () => {
  it('adds people to a UAT and puts one of them in a numbered group', async () => {
    const user = userEvent.setup()
    const { db, dataSource, workshop } = setup()
    renderRoute(`/projects/DEMO-KARIR/uat/${workshop.id}?tab=peserta`, { dataSource })
    await user.type(
      await screen.findByLabelText(/^Nama dan e-mail/),
      'Pak Tono{enter}Bu Lina, lina.uji@demo.invalid',
    )
    await user.click(screen.getByRole('button', { name: 'Tambahkan' }))
    expect(await screen.findByText('2 peserta ditambahkan.')).toBeInTheDocument()

    const group = await screen.findByLabelText('Kelompok Pak Tono')
    await user.selectOptions(group, 'Meja 2')
    expect(await screen.findByText('Pak Tono masuk Meja 2.')).toBeInTheDocument()
    const tono = db.participants.find((p) => p.name === 'Pak Tono')!
    const meja2 = db.tables.find((t) => t.runId === workshop.id && t.name === 'Meja 2')!
    expect(tono.tableId).toBe(meja2.id)
  })
})

describe('a Pengguna works inside their own UATs', () => {
  it('sees "UAT saya" with their group, and no Fase folders', async () => {
    const user = userEvent.setup()
    const { db, dataSource, workshop } = setup({ superAdmin: false, userId: '3' })
    // Put the demo user in Meja 1 of the workshop UAT.
    const mine = db.participants.find((p) => p.runId === workshop.id && p.userId === '3')!
    mine.tableId = db.tables.find((t) => t.runId === workshop.id && t.name === 'Meja 1')!.id
    renderRoute('/projects/DEMO-KARIR/uat', { dataSource })

    expect(await screen.findByRole('heading', { level: 1, name: 'UAT saya' })).toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Navigasi utama' })
    expect(within(menu).queryByRole('link', { name: /^Semua Fase/ })).toBeNull()
    expect(within(menu).getByRole('link', { name: /^Bug Reporting/ })).toBeInTheDocument()
    const card = (await screen.findByRole('heading', { name: workshop.name })).closest(
      'li',
    ) as HTMLElement
    expect(within(card).getByText('Kelompok Anda: Meja 1')).toBeInTheDocument()

    await user.click(within(card).getByRole('link', { name: workshop.name }))
    expect(await screen.findByRole('heading', { name: 'UAT Anda' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kerjakan skenario' })).toHaveAttribute(
      'href',
      `/projects/DEMO-KARIR/runs/${workshop.id}`,
    )
    // Managing the UAT is for Admins.
    expect(screen.queryByRole('tab', { name: /Peserta/ })).toBeNull()
  })
})

describe('Bug Reporting', () => {
  it('lets an Admin review a public report before it shows publicly', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    db.bugReporting.find((b) => b.projectId === project.id)!.accept_reports = true
    await dataSource.sendPublicBugReport('DEMO-KARIR', {
      title: 'Halaman lowongan lambat dibuka',
      description: 'Butuh lebih dari 30 detik untuk tampil.',
      reporter_name: 'Warga',
    })
    const report = db.defects.at(-1)!
    renderRoute('/projects/DEMO-KARIR/bugs?tab=laporan', { dataSource })
    const card = (await screen.findByText('Halaman lowongan lambat dibuka')).closest(
      'li',
    ) as HTMLElement
    expect(within(card).getByText(/Warga/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Sudah ditinjau' }))
    expect(await screen.findByText('Tidak ada laporan publik yang menunggu.')).toBeInTheDocument()
    expect(report.reviewedAt).toBeTruthy()
  })
})
