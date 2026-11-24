import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

function setup() {
  const db = createMockDb()
  const dataSource = createMockDataSource({ latencyMs: 0, db })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  return { db, dataSource, project }
}

/** The table and the phone cards both render in jsdom; take the first checkbox. */
const checkbox = (label: string) =>
  screen.getAllByRole('checkbox', { name: label })[0] as HTMLElement

describe('bulk actions and bug cycle (ADR 0013)', () => {
  it('changes the severity of several bugs at once', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const targets = db.defects.filter((d) => d.projectId === project.id).slice(0, 2)
    renderRoute('/projects/DEMO-KARIR/bugs', { dataSource })

    await screen.findAllByText(targets[0]!.bug_code)
    for (const d of targets) await user.click(checkbox(`Pilih ${d.bug_code}`))
    const bar = screen.getByRole('region', { name: '2 dipilih' })
    await user.selectOptions(within(bar).getByLabelText('Yang diubah'), 'Tingkat dampak')
    await user.selectOptions(within(bar).getByLabelText('Nilai baru'), 'Kritis')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan ke 2' }))

    expect(await screen.findByText(/2 diubah · 0 sudah sesuai · 0 dilewati/)).toBeInTheDocument()
    expect(targets.every((d) => d.severity_code === 'CRITICAL')).toBe(true)
    expect(screen.queryByRole('region', { name: /dipilih/ })).not.toBeInTheDocument()
  })

  it('reports bugs that the workflow does not allow to move', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const open = db.defects.find((d) => d.projectId === project.id && d.status_code === 'OPEN')!
    renderRoute('/projects/DEMO-KARIR/bugs', { dataSource })
    await screen.findAllByText(open.bug_code)
    await user.click(checkbox(`Pilih ${open.bug_code}`))
    const bar = screen.getByRole('region', { name: '1 dipilih' })
    await user.selectOptions(within(bar).getByLabelText('Nilai baru'), 'Selesai')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan ke 1' }))
    expect(await screen.findByText(/0 diubah · 0 sudah sesuai · 1 dilewati/)).toBeInTheDocument()
    expect(
      screen.getByText(/status sekarang tidak bisa langsung pindah ke status itu/),
    ).toBeInTheDocument()
    expect(open.status_code).toBe('OPEN')
  })

  it('files bugs under a cycle and filters by it', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const cycle = db.cycles.find((cy) => cy.projectId === project.id)!
    const bug = await dataSource.createDefect(
      'DEMO-KARIR',
      { title: 'Bug di siklus pertama', cycle_id: cycle.id },
      'key-1',
    )
    expect(bug.cycle).toMatchObject({ id: cycle.id, cycle_code: cycle.cycle_code })
    renderRoute('/projects/DEMO-KARIR/bugs', { dataSource })
    const label = `${cycle.cycle_code} - ${cycle.title}`
    // The Fase filter sits behind "Saring lebih lanjut" (owner, 2026-11-24).
    await user.click(await screen.findByRole('button', { name: /Saring lebih lanjut/ }))
    await screen.findByRole('option', { name: label })
    await user.selectOptions(screen.getByLabelText('Fase'), label)
    await waitFor(() =>
      expect(screen.getAllByText('Bug di siklus pertama').length).toBeGreaterThan(0),
    )
    const listed = await dataSource.listDefects('DEMO-KARIR', { cycle: cycle.id })
    expect(listed.data.every((d) => d.cycle?.id === cycle.id)).toBe(true)
  })

  it('marks several draft test cases ready, each with a new version', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const drafts = db.cases
      .filter((c) => c.projectId === project.id && c.case_status !== 'ARCHIVED')
      .slice(0, 2)
    for (const c of drafts) c.case_status = 'DRAFT'
    const versions = drafts.map((c) => c.current_version)
    renderRoute('/projects/DEMO-KARIR/test-cases?status=DRAFT', { dataSource })
    await screen.findAllByText(drafts[0]!.case_code)
    for (const c of drafts) await user.click(checkbox(`Pilih ${c.case_code}`))
    const bar = screen.getByRole('region', { name: '2 dipilih' })
    expect(within(bar).getByLabelText('Aksi')).toHaveValue('ready')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan ke 2' }))
    expect(await screen.findByText(/2 diubah/)).toBeInTheDocument()
    expect(drafts.map((c) => c.case_status)).toEqual(['READY', 'READY'])
    expect(drafts.map((c) => c.current_version)).toEqual(versions.map((v) => v + 1))
  })

  it('asks before archiving selected test cases', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const target = db.cases.find((c) => c.projectId === project.id && c.case_status !== 'ARCHIVED')!
    renderRoute('/projects/DEMO-KARIR/test-cases', { dataSource })
    await screen.findAllByText(target.case_code)
    await user.click(checkbox(`Pilih ${target.case_code}`))
    const bar = screen.getByRole('region', { name: '1 dipilih' })
    await user.selectOptions(within(bar).getByLabelText('Aksi'), 'Arsipkan')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan ke 1' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Arsipkan 1 skenario uji?' })
    await user.click(within(dialog).getByRole('button', { name: 'Arsipkan' }))
    await waitFor(() => expect(target.case_status).toBe('ARCHIVED'))
  })

  it('merges selected duplicates from the bulk bar, keeping the chosen one', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const [keep, dup] = db.cases
      .filter((c) => c.projectId === project.id && c.case_status !== 'ARCHIVED')
      .slice(0, 2)
    renderRoute('/projects/DEMO-KARIR/test-cases', { dataSource })
    await screen.findAllByText(keep!.case_code)
    await user.click(checkbox(`Pilih ${keep!.case_code}`))
    await user.click(checkbox(`Pilih ${dup!.case_code}`))
    const bar = screen.getByRole('region', { name: '2 dipilih' })
    await user.selectOptions(within(bar).getByLabelText('Aksi'), 'Gabungkan (duplikat)')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan ke 2' }))
    const dialog = await screen.findByRole('dialog', { name: 'Gabungkan 2 skenario uji' })
    await user.click(within(dialog).getByRole('radio', { name: new RegExp(keep!.case_code) }))
    await user.click(
      within(dialog).getByRole('button', { name: `Gabungkan 1 ke ${keep!.case_code}` }),
    )
    await waitFor(() => expect(dup!.case_status).toBe('ARCHIVED'))
    expect(dup!.mergedInto).toBe(keep!.id)
    expect(keep!.case_status).not.toBe('ARCHIVED')
  })

  it('lists similar cases side by side and merges one pair', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    const a = await dataSource.createTestCase('DEMO-KARIR', {
      module_code: db.modules[0]!.module_code,
      title: '[FSD-LPL-001/002/030] Aksi Lapor pada lowongan yang sudah dilamar',
      expected_result: 'Aksi Laporkan tampil pada lowongan native yang telah dilamar',
    })
    const b = await dataSource.createTestCase('DEMO-KARIR', {
      module_code: db.modules[0]!.module_code,
      title: '[FSD-LPL-001/002] Aksi Lapor pada detail lowongan',
      expected_result: 'Aksi Laporkan lowongan ini tampil dan dapat dipilih',
    })
    renderRoute('/projects/DEMO-KARIR/test-cases/similar', { dataSource })
    const keepA = await screen.findByRole('button', { name: `Pertahankan ${a.case_code}` })
    const card = keepA.closest('li') as HTMLElement
    expect(within(card).getByText('Rujukan sama')).toBeInTheDocument()
    expect(within(card).getByText('Rujukan: FSD-LPL-001, FSD-LPL-002')).toBeInTheDocument()
    await user.click(keepA)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: `Gabungkan 1 ke ${a.case_code}` }))
    expect(
      await screen.findByText(`${b.case_code} digabung ke ${a.case_code}.`),
    ).toBeInTheDocument()
    const merged = await dataSource.getTestCase('DEMO-KARIR', b.id)
    expect(merged.merged_into).toEqual({ id: a.id, case_code: a.case_code })
  })

  it('reviews code conflicts and creates the different case under a new code', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    const header =
      'case_code,module_code,suite_name,category,title,requirement_refs,priority_code,test_type_code,actor_label,preconditions,test_steps_text,expected_result,source_locale,source_document'
    await dataSource.createTestCase('DEMO-KARIR', {
      case_code: 'UAT-KON-001',
      module_code: db.modules[0]!.module_code,
      title: 'Aksi lapor pada lowongan yang sudah dilamar',
      expected_result: 'Aksi tampil',
    })
    const moduleCode = db.modules[0]!.module_code
    const csv = [
      header,
      `UAT-KON-001,${moduleCode},Fase 2,,Aksi lapor pada detail lowongan,,Must Have,Positif,,,1. Buka,Aksi laporkan tampil,id,`,
    ].join('\n')
    const { router } = renderRoute('/projects/DEMO-KARIR/imports', { dataSource })
    await user.upload(
      await screen.findByLabelText('Pilih file'),
      new File([csv], 'fase2-tersembunyi.csv', { type: 'text/csv' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/imports\/\d+$/))
    await screen.findByRole('heading', { level: 1, name: 'fase2-tersembunyi.csv' })
    await user.click(await screen.findByRole('button', { name: 'Periksa' }))

    const decision = await screen.findByRole('combobox', {
      name: 'Keputusan untuk UAT-KON-001 (CSV!2)',
    })
    expect(decision).toHaveValue('SKIP')
    expect(screen.getByText('Aksi lapor pada lowongan yang sudah dilamar')).toBeInTheDocument()
    await user.selectOptions(decision, 'Buat dengan kode baru')
    await user.click(screen.getByRole('button', { name: 'Periksa' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Keputusan untuk UAT-KON-001/ })).toHaveValue(
        'NEW_CODE',
      ),
    )
    const apply = await screen.findByRole('button', { name: 'Terapkan impor' })
    await waitFor(() => expect(apply).toBeEnabled())
    await user.click(apply)
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Terapkan impor',
      }),
    )
    await waitFor(() =>
      expect(db.cases.some((c) => c.title === 'Aksi lapor pada detail lowongan')).toBe(true),
    )
    const created = db.cases.find((c) => c.title === 'Aksi lapor pada detail lowongan')!
    expect(created.case_code).not.toBe('UAT-KON-001')
    expect(db.cases.find((c) => c.case_code === 'UAT-KON-001')?.title).toBe(
      'Aksi lapor pada lowongan yang sudah dilamar',
    )
  })

  it('imports bugs from a tracker CSV: failed rows become bugs, passed rows are skipped', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const before = db.defects.filter((d) => d.projectId === project.id).length
    const { router } = renderRoute('/projects/DEMO-KARIR/imports', { dataSource })
    await user.click(await screen.findByRole('radio', { name: /^Masalah/ }))
    const csv = [
      'ID UAT,Fitur / Proses,Status UAT,Detail Hasil Aktual / Defect,Severity,Penguji,Tgl UAT',
      'UAT-X-001,Simpan profil,Gagal Diuji,Tombol simpan tidak merespons,High,Penguji Contoh,30/07/2026',
      'UAT-X-002,Ubah sandi,Berhasil Diuji,Sesuai,Info,Penguji Contoh,30/07/2026',
      'UAT-X-003,Unggah foto,Gagal Diuji,Foto tidak tersimpan,Critical,Penguji Contoh,31/07/2026',
    ].join('\n')
    await user.upload(
      screen.getByLabelText('Pilih file'),
      new File([csv], 'tracker.csv', { type: 'text/csv' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/imports\/\d+$/))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'tracker.csv' }),
    ).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Periksa' }))
    expect(
      await screen.findByText(
        /2 masalah akan dibuat · 1 baris dilewati · 0 sudah ada · 0 bermasalah/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Status di file → status masalah: Gagal Diuji' }),
    ).toHaveValue('OPEN')
    await user.click(screen.getByRole('button', { name: 'Terapkan impor' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Terapkan impor' }))
    expect(await screen.findByText(/2 masalah dibuat · 1 baris dilewati/)).toBeInTheDocument()
    const created = db.defects.filter((d) => d.projectId === project.id).slice(before)
    expect(created.map((d) => [d.title, d.severity_code, d.status_code])).toEqual([
      ['Simpan profil', 'HIGH', 'OPEN'],
      ['Unggah foto', 'CRITICAL', 'OPEN'],
    ])
    expect(created[0]).toMatchObject({
      legacyReporterName: 'Penguji Contoh',
      sourceReference: 'tracker.csv / CSV / baris 2 / UAT-X-001',
    })
  })
})
