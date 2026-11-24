import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { ApiClientError } from '../services/api-client'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/**
 * Mode Workshop (ADR 0016) inside a UAT (ADR 0019) in the demo data: public UAT, public Bug
 * Reporting, group cards, easy answers.
 */
function setup() {
  const db = createMockDb()
  const dataSource = createMockDataSource({ latencyMs: 0, db, superAdmin: true })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  const cycle = db.cycles.find((c) => c.projectId === project.id)!
  // The workshop UAT of the demo: three numbered groups with cards.
  const uat = db.runs.find((r) => r.projectId === project.id && r.status_code === 'ACTIVE')!
  const reporting = db.bugReporting.find((b) => b.projectId === project.id)!
  return { db, dataSource, project, cycle, uat, reporting }
}

describe('public front page, public UAT and public Bug Reporting', () => {
  it('lists the public UAT and shows only the switched-on data', async () => {
    const user = userEvent.setup()
    const { dataSource, uat } = setup()
    renderRoute('/publik', { dataSource })

    expect(
      await screen.findByRole('heading', { name: /Bersama memastikan layanan Pasar Kerja/ }),
    ).toBeInTheDocument()
    const card = (await screen.findByRole('heading', { name: uat.name })).closest(
      'li',
    ) as HTMLElement
    expect(within(card).getByText(/Forum workshop UAT bersama/)).toBeInTheDocument()
    await user.click(within(card).getByRole('link', { name: /Lihat UAT ini/ }))

    expect(
      await screen.findByRole('heading', { name: 'Fitur yang dikerjakan' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Meja 1').length).toBeGreaterThan(0)
    // Problems live in the project's Bug Reporting, with its own switch.
    await user.click(screen.getByRole('link', { name: /Lihat daftar masalah/ }))
    const bugs = await screen.findAllByText(/^BUG-/)
    expect(bugs.length).toBeGreaterThan(0)
    // Reporter and description are switched off in the demo Bug Reporting.
    expect(screen.queryByText('Dilaporkan oleh')).not.toBeInTheDocument()
  })

  it('sums up every public UAT on the front page, counting only what each one shows', async () => {
    const { db, dataSource } = setup()
    renderRoute('/publik', { dataSource })
    const totals = (
      await screen.findByRole('heading', { name: 'Ringkasan semua UAT yang dibuka' })
    ).closest('section') as HTMLElement
    const open = db.runs.filter((r) => r.is_public).length
    expect(within(totals).getByText('UAT dibuka').closest('div')).toHaveTextContent(
      `UAT dibuka${open}`,
    )
    expect(within(totals).getByText('Skenario sudah dicoba')).toBeInTheDocument()
    expect(within(totals).getByText('Masalah dilaporkan')).toBeInTheDocument()
    expect(within(totals).getByRole('img', { name: /sudah dicoba/ })).toBeInTheDocument()
  })

  it('says so when a UAT is not public', async () => {
    const { dataSource, uat } = setup()
    uat.is_public = false
    renderRoute(`/publik/uat/${uat.id}`, { dataSource })
    expect(await screen.findByText(/tidak dibuka untuk umum/)).toBeInTheDocument()
  })

  it('opens the public UAT of an old printed Fase link', async () => {
    const { dataSource, cycle } = setup()
    const { router } = renderRoute(`/publik/${cycle.id}`, { dataSource })
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/publik\/uat\/\d+$/))
  })

  it('takes a report from the public form; it shows only after an Admin reviewed it', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project, reporting } = setup()
    reporting.accept_reports = true
    renderRoute(`/publik/masalah/${project.project_code}`, { dataSource })
    await user.type(await screen.findByLabelText(/Judul singkat/), 'Tombol lamar tidak merespons')
    await user.type(
      screen.getByLabelText(/Apa yang terjadi/),
      'Setelah menekan Lamar, tidak terjadi apa-apa.',
    )
    await user.type(screen.getByLabelText(/Nama Anda/), 'Warga')
    await user.click(screen.getByRole('button', { name: 'Kirim laporan' }))
    expect(await screen.findByText('Terima kasih, laporan diterima.')).toBeInTheDocument()
    const report = db.defects.at(-1)!
    expect(report).toMatchObject({ title: 'Tombol lamar tidak merespons', source_kind: 'PUBLIC' })
    expect(report.reviewedAt ?? null).toBeNull()
    const waiting = await dataSource.listPublicReports(project.project_code)
    expect(waiting.map((r) => r.title)).toContain('Tombol lamar tidak merespons')
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
  it('creates a numbered group and shows its card code', async () => {
    const user = userEvent.setup()
    const { db, dataSource, uat } = setup()
    renderRoute(`/projects/DEMO-KARIR/uat/${uat.id}?tab=kelompok`, { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Buat meja' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Nama meja/), 'Meja Tamu')
    const number = within(dialog).getByLabelText(/^Nomor meja/)
    await user.clear(number)
    await user.type(number, '9')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    const card = (await screen.findByText('Meja Tamu · Meja 9')).closest('li') as HTMLElement
    expect(within(card).getByText(/^\d{3} \d{3}$/)).toBeInTheDocument()
    expect(within(card).getByText('Aktif')).toBeInTheDocument()
    expect(db.tables.find((t) => t.name === 'Meja Tamu')).toMatchObject({
      runId: uat.id,
      tableNumber: 9,
    })
  })

  it('switches the UAT public page off with its main switch', async () => {
    const user = userEvent.setup()
    const { dataSource, uat } = setup()
    renderRoute(`/projects/DEMO-KARIR/uat/${uat.id}?tab=publik`, { dataSource })
    const members = await screen.findByRole('checkbox', { name: /Nama anggota kelompok/ })
    expect(members).not.toBeChecked()
    await user.click(members)
    await user.click(screen.getByRole('button', { name: 'Simpan tampilan publik' }))
    await waitFor(() => expect(uat.public_fields).toContain('features.members'))
    // Problem fields are not here: they belong to Bug Reporting.
    expect(screen.queryByRole('checkbox', { name: /Pelapor/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: /Tampilkan UAT ini di halaman depan/ }))
    await user.click(screen.getByRole('button', { name: 'Simpan tampilan publik' }))
    await waitFor(() => expect(uat.is_public).toBe(false))
  })

  it('switches a Bug Reporting field on with its own switch', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    renderRoute('/projects/DEMO-KARIR/bugs?tab=publik', { dataSource })
    const reporter = await screen.findByRole('checkbox', { name: /Pelapor/ })
    expect(reporter).not.toBeChecked()
    await user.click(reporter)
    await user.click(screen.getByRole('button', { name: 'Simpan tampilan publik' }))
    await waitFor(() =>
      expect(db.bugReporting.find((r) => r.projectId === project.id)?.public_fields).toContain(
        'bugs.reporter',
      ),
    )
  })

  it('asks before changing what the public page shows for a feature', async () => {
    const user = userEvent.setup()
    const { dataSource, uat } = setup()
    renderRoute(`/projects/DEMO-KARIR/uat/${uat.id}?tab=fitur`, { dataSource })
    const groups = await screen.findAllByRole('radiogroup', { name: /^Status fitur / })
    const first = groups[0] as HTMLElement
    const hidden = within(first).getByRole('radio', { name: 'Disembunyikan' })
    await user.click(hidden)
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/menjadi "Disembunyikan"\?/)
    expect(dialog).toHaveTextContent(/tidak tampil di halaman publik/)
    await user.click(within(dialog).getByRole('button', { name: 'Batal' }))
    expect(hidden).toHaveAttribute('aria-checked', 'false')

    await user.click(hidden)
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Ubah status' }),
    )
    await waitFor(() =>
      expect(within(first).getByRole('radio', { name: 'Disembunyikan' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })

  it('reviews a problem sent by a table', async () => {
    const user = userEvent.setup()
    const { db, dataSource, uat } = setup()
    await dataSource.joinWorkshop('246810')
    const feature = (await dataSource.getWorkshopSession()).features[0]!
    const scenario = (await dataSource.listWorkshopCases(feature.module.id))[0]!
    const saved = await dataSource.saveWorkshopResult(scenario.run_case_id, {
      result_status: 'FAILED',
      note: 'Muncul pesan error merah',
    })
    await dataSource.logout()
    renderRoute(`/projects/DEMO-KARIR/uat/${uat.id}?tab=masuk`, { dataSource })
    const item = (await screen.findByText('Muncul pesan error merah')).closest('li') as HTMLElement
    await user.click(within(item).getByRole('radio', { name: 'Berat' }))
    await waitFor(() =>
      expect(db.defects.find((d) => d.id === saved.defect?.id)?.severity_code).toBe('HIGH'),
    )
    await user.click(within(item).getByRole('button', { name: 'Sudah ditinjau' }))
    expect(await screen.findByText(/Tidak ada masalah yang menunggu ditinjau/)).toBeInTheDocument()
  })

  it('prints table cards with a QR code, the table number and the 6-digit code', async () => {
    const { dataSource, uat } = setup()
    renderRoute(`/cetak/kartu/DEMO-KARIR/${uat.id}`, { dataSource })
    expect(
      await screen.findByRole('img', { name: /Kode QR untuk masuk sebagai Meja 1/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('246 810')).toBeInTheDocument()
    expect(screen.getAllByText('Meja 1').length).toBeGreaterThan(0)
  })

  it('shows every group on the big screen', async () => {
    const { dataSource, uat } = setup()
    renderRoute(`/layar/DEMO-KARIR/${uat.id}`, { dataSource })
    expect(await screen.findByRole('heading', { name: uat.name })).toBeInTheDocument()
    expect(screen.getByText(/Meja 1/)).toBeInTheDocument()
    expect(screen.getByText(/Meja 3/)).toBeInTheDocument()
  })
})

describe('answers kept on the device when the internet drops', () => {
  it('keeps an answer, shows it as waiting, and sends it once the connection is back', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    let online = false
    const flaky = {
      ...dataSource,
      saveWorkshopResult: async (...args: Parameters<typeof dataSource.saveWorkshopResult>) => {
        if (!online) throw new ApiClientError(0, 'INTERNAL_ERROR', 'Network error', null)
        return dataSource.saveWorkshopResult(...args)
      },
    }
    await dataSource.joinWorkshop('246810')
    renderRoute('/meja/kerja', { dataSource: flaky })
    await user.click(
      (await screen.findAllByRole('link', { name: /Mulai menguji|Lanjutkan|Lihat lagi/ }))[0]!,
    )
    const before = db.executions.length
    await user.click(await screen.findByRole('button', { name: 'Sesuai' }))
    expect(await screen.findByText('Disimpan di perangkat ini')).toBeInTheDocument()
    expect(screen.getByText(/1 jawaban belum terkirim/)).toBeInTheDocument()
    expect(db.executions.length).toBe(before)

    online = true
    await user.click(screen.getByRole('button', { name: 'Kirim sekarang' }))
    await waitFor(() =>
      expect(screen.queryByText(/jawaban belum terkirim/)).not.toBeInTheDocument(),
    )
    expect(db.executions.length).toBe(before + 1)
    expect(db.executions.at(-1)?.result_status).toBe('PASSED')
  })
})

describe('guide and public preview for staff', () => {
  it('offers the guide and the public site under Bantuan, not in the project menu', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/projects/DEMO-KARIR/dashboard', { dataSource })
    const menu = await screen.findByRole('navigation', { name: 'Navigasi utama' })
    expect(within(menu).queryByRole('link', { name: /Panduan|Halaman publik/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Bantuan' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('link', { name: /panduan lengkap/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/panduan/),
    )
    expect(within(panel).getByRole('link', { name: 'Lihat halaman publik' })).toHaveAttribute(
      'href',
      '/publik',
    )
  })

  it('previews a closed UAT with the chosen data before publishing', async () => {
    const { dataSource, uat } = setup()
    uat.is_public = false
    renderRoute(`/publik/uat/${uat.id}?pratinjau=1&data=features.list`, { dataSource })
    expect(await screen.findByText('Pratinjau.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Fitur yang dikerjakan' }),
    ).toBeInTheDocument()
    // Progress per feature was not chosen for the preview.
    expect(screen.queryByText(/sudah dicoba/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Buka TestBoard/ })).toBeInTheDocument()
  })
})
