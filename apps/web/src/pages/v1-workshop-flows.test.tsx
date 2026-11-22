import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/** Mode Workshop (ADR 0016) in the demo data: public Fase, table cards, easy answers. */
function setup() {
  const db = createMockDb()
  const dataSource = createMockDataSource({ latencyMs: 0, db, superAdmin: true })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  const cycle = db.cycles.find((c) => c.projectId === project.id)!
  return { db, dataSource, project, cycle }
}

describe('public front page and public Fase', () => {
  it('lists the public Fase and shows only the switched-on data', async () => {
    const user = userEvent.setup()
    const { dataSource, cycle } = setup()
    renderRoute('/publik', { dataSource })

    expect(
      await screen.findByRole('heading', { name: /Bersama memastikan layanan Pasar Kerja/ }),
    ).toBeInTheDocument()
    const card = (await screen.findByRole('heading', { name: cycle.title })).closest(
      'li',
    ) as HTMLElement
    expect(within(card).getByText(/Forum workshop UAT bersama/)).toBeInTheDocument()
    await user.click(within(card).getByRole('link', { name: /Lihat fase ini/ }))

    expect(await screen.findByRole('tab', { name: /Fitur yang dikerjakan/ })).toBeInTheDocument()
    expect(screen.getAllByText('Meja 1').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /Daftar masalah/ }))
    const bugs = await screen.findAllByText(/^BUG-/)
    expect(bugs.length).toBeGreaterThan(0)
    // Reporter and description are switched off in the demo Fase.
    expect(screen.queryByText('Dilaporkan oleh')).not.toBeInTheDocument()
  })

  it('says so when a Fase is not public', async () => {
    const { dataSource, cycle } = setup()
    cycle.is_public = false
    renderRoute(`/publik/${cycle.id}`, { dataSource })
    expect(await screen.findByText(/tidak dibuka untuk umum/)).toBeInTheDocument()
  })
})

describe('table card and Mode Mudah', () => {
  it('rejects a wrong code in plain words', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/meja', { dataSource })
    await user.type(await screen.findByLabelText(/Kode meja/), '999999')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kode tidak dikenal')
  })

  it('signs in from the QR, answers a scenario and reports a problem', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    const { router } = renderRoute('/meja#246810', { dataSource })

    expect(
      await screen.findByRole('heading', { name: 'Selamat datang, Meja 1' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/meja/kerja')
    await user.click(screen.getByRole('radio', { name: 'Bu Sri' }))
    const firstFeature = screen.getAllByRole('link', {
      name: /Mulai menguji|Lanjutkan|Lihat lagi/,
    })[0]!
    await user.click(firstFeature)

    const buttons = await screen.findByText('Setelah mencoba, apakah hasilnya sesuai?')
    expect(buttons).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sesuai' }))
    expect(await screen.findByText('Tersimpan. Terima kasih!')).toBeInTheDocument()
    const passed = db.executions.at(-1)!
    expect(passed).toMatchObject({ result_status: 'PASSED', legacyTester: 'Bu Sri' })

    await user.click(screen.getByRole('button', { name: /Lanjut ke skenario berikutnya/ }))
    await user.click(await screen.findByRole('button', { name: 'Tidak sesuai' }))
    await user.click(screen.getByRole('button', { name: 'Kirim laporan' }))
    expect(await screen.findByText(/Ceritakan dulu apa yang terjadi/)).toBeInTheDocument()
    await user.type(
      screen.getByLabelText(/Apa yang terjadi/),
      'Tombol simpan tidak merespon setelah formulir diisi',
    )
    await user.click(screen.getByRole('button', { name: 'Kirim laporan' }))
    expect(await screen.findByText(/Masalah dicatat dengan kode BUG-/)).toBeInTheDocument()
    const bug = db.defects.at(-1)!
    expect(bug).toMatchObject({
      actual_behavior: 'Tombol simpan tidak merespon setelah formulir diisi',
      legacyReporterName: 'Bu Sri',
    })
  })

  it('keeps a table card out of the staff pages', async () => {
    const { dataSource } = setup()
    await dataSource.joinWorkshop('135791')
    const { router } = renderRoute('/projects/DEMO-KARIR/test-cases', { dataSource })
    expect(
      await screen.findByRole('heading', { name: 'Selamat datang, Meja 2' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/meja/kerja')
  })

  it('adds "Saya juga mengalami" to a problem from another table', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    await dataSource.joinWorkshop('246810')
    const runCase = (
      await dataSource.listWorkshopCases(
        (await dataSource.getWorkshopSession()).features[0]!.module.id,
      )
    )[0]!
    await dataSource.saveWorkshopResult(runCase.run_case_id, {
      result_status: 'FAILED',
      note: 'Halaman kosong setelah login',
    })
    await dataSource.logout()
    await dataSource.joinWorkshop('135791')
    renderRoute('/meja/kerja/masalah', { dataSource })
    const item = (await screen.findByText(/Halaman kosong setelah login/)).closest(
      'li',
    ) as HTMLElement
    await user.click(within(item).getByRole('button', { name: 'Saya juga mengalami' }))
    await user.click(within(item).getByRole('button', { name: 'Kirim' }))
    expect(await within(item).findByText('Meja ini sudah mencatat')).toBeInTheDocument()
    expect(within(item).getByText('1 lainnya juga mengalami')).toBeInTheDocument()
    expect(db.defects.at(-1)?.actual_behavior).toBe('Halaman kosong setelah login')
  })
})

describe('facilitator side', () => {
  it('creates a table and shows its card code', async () => {
    const user = userEvent.setup()
    const { dataSource, cycle } = setup()
    renderRoute(`/projects/DEMO-KARIR/workshop/${cycle.id}?tab=meja`, { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Buat meja' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Nama meja/), 'Meja Tamu')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    const card = (await screen.findByText('Meja Tamu')).closest('li') as HTMLElement
    expect(within(card).getByText(/^\d{3} \d{3}$/)).toBeInTheDocument()
    expect(within(card).getByText('Aktif')).toBeInTheDocument()
  })

  it('switches a public field on and off with the main switch', async () => {
    const user = userEvent.setup()
    const { dataSource, cycle } = setup()
    renderRoute(`/projects/DEMO-KARIR/workshop/${cycle.id}?tab=publik`, { dataSource })
    const reporter = await screen.findByRole('checkbox', { name: /Pelapor/ })
    expect(reporter).not.toBeChecked()
    await user.click(reporter)
    await user.click(screen.getByRole('button', { name: 'Simpan tampilan publik' }))
    await waitFor(() => expect(cycle.public_fields).toContain('bugs.reporter'))

    await user.click(screen.getByRole('switch', { name: /Tampilkan fase ini di halaman depan/ }))
    await user.click(screen.getByRole('button', { name: 'Simpan tampilan publik' }))
    await waitFor(() => expect(cycle.is_public).toBe(false))
  })

  it('reviews a problem sent by a table', async () => {
    const user = userEvent.setup()
    const { db, dataSource, cycle } = setup()
    await dataSource.joinWorkshop('246810')
    const feature = (await dataSource.getWorkshopSession()).features[0]!
    const scenario = (await dataSource.listWorkshopCases(feature.module.id))[0]!
    const saved = await dataSource.saveWorkshopResult(scenario.run_case_id, {
      result_status: 'FAILED',
      note: 'Muncul pesan error merah',
    })
    await dataSource.logout()
    renderRoute(`/projects/DEMO-KARIR/workshop/${cycle.id}?tab=masuk`, { dataSource })
    const item = (await screen.findByText('Muncul pesan error merah')).closest('li') as HTMLElement
    await user.click(within(item).getByRole('radio', { name: 'Tinggi' }))
    await waitFor(() =>
      expect(db.defects.find((d) => d.id === saved.defect?.id)?.severity_code).toBe('HIGH'),
    )
    await user.click(within(item).getByRole('button', { name: 'Sudah ditinjau' }))
    expect(await screen.findByText(/Tidak ada masalah yang menunggu ditinjau/)).toBeInTheDocument()
  })

  it('prints table cards with a QR code and the 6-digit code', async () => {
    const { dataSource, cycle } = setup()
    renderRoute(`/cetak/kartu/DEMO-KARIR/${cycle.id}`, { dataSource })
    expect(
      await screen.findByRole('img', { name: /Kode QR untuk masuk sebagai Meja 1/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('246 810')).toBeInTheDocument()
  })

  it('shows every table on the big screen', async () => {
    const { dataSource, cycle } = setup()
    renderRoute(`/layar/DEMO-KARIR/${cycle.id}`, { dataSource })
    expect(await screen.findByRole('heading', { name: cycle.title })).toBeInTheDocument()
    expect(screen.getByText('Meja 1')).toBeInTheDocument()
    expect(screen.getByText('Meja 3')).toBeInTheDocument()
  })
})
