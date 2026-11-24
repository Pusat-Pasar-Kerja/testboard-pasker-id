import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

describe('routing & shell', () => {
  it('redirects / to the project list and shows only member projects', async () => {
    const { router } = renderRoute('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Proyek' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/projects')
    expect((await screen.findAllByText('Demo Portal Karier')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Demo Portal Pelatihan').length).toBeGreaterThan(0)
  })

  it('shows a not-found page for a project the user cannot see, without leaking data', async () => {
    renderRoute('/projects/RAHASIA/dashboard')
    expect(
      await screen.findByText('Proyek tidak ditemukan, atau Anda bukan anggota proyek ini.'),
    ).toBeInTheDocument()
  })

  it('shows a 404 for unknown pages', async () => {
    renderRoute('/tidak-ada')
    expect(await screen.findByText('Halaman tidak ditemukan')).toBeInTheDocument()
  })

  it('switches the whole UI to English without reload (TB-I18N-001)', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/dashboard`)
    await screen.findByRole('heading', { level: 1, name: 'Beranda proyek' })

    await user.click(screen.getAllByRole('button', { name: /English/ })[0] as HTMLElement)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Project home' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Bug Reporting/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /^All phases/ }).length).toBeGreaterThan(0)
    expect(document.documentElement.lang).toBe('en')
  })

  it('opens the mobile navigation drawer and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/dashboard`)
    await screen.findByRole('heading', { level: 1, name: 'Beranda proyek' })

    await user.click(screen.getByRole('button', { name: 'Buka menu navigasi' }))
    const dialog = screen.getByRole('dialog', { name: 'Navigasi utama' })
    expect(within(dialog).getByRole('link', { name: /^Bug Reporting/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /^Semua Fase/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('dashboard', () => {
  it('renders KPIs, the latest-status bar with legend, and severity bars', async () => {
    renderRoute(`${P}/dashboard`)
    expect(await screen.findByText('Skenario uji direncanakan')).toBeInTheDocument()
    expect(screen.getByText('Persentase sesuai')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Distribusi status terbaru/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kritis: \d+ masalah terbuka/ })).toHaveAttribute(
      'href',
      `${P}/bugs?status=open&severity=CRITICAL`,
    )
  })
})

describe('test cases', () => {
  it('applies the module filter from the URL (deep link survives refresh)', async () => {
    renderRoute(`${P}/test-cases?module=AUTH`)
    const table = await screen.findByRole('table')
    const codes = within(table)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.every((code) => code?.startsWith('UAT-AUTH-'))).toBe(true)
  })

  it('shows a filtered empty state with a reset action', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`${P}/test-cases?q=zzz-tidak-ada`)
    expect(
      await screen.findByText('Tidak ada skenario uji yang cocok dengan filter.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Hapus filter/ }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('opens a case detail and switches tabs with the keyboard', async () => {
    const user = userEvent.setup()
    const db = createMockDb()
    const testCase = db.cases.find((c) => c.case_code === 'UAT-AUTH-001')
    renderRoute(`${P}/test-cases/${testCase?.id}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: testCase?.title }),
    ).toBeInTheDocument()
    const overview = screen.getByRole('tab', { name: 'Ringkasan' })
    expect(overview).toHaveAttribute('aria-selected', 'true')

    overview.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Dipakai di UAT/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getAllByText(/RUN-/).length).toBeGreaterThan(0)
  })
})

describe('runs and bugs', () => {
  it('lists run cases with their latest status and filters by status', async () => {
    const db = createMockDb()
    const run = db.runs.find((r) => r.run_code === 'RUN-S1-20261012')
    renderRoute(`${P}/runs/${run?.id}?status=FAILED`)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'UAT Sprint 1' }),
    ).toBeInTheDocument()
    const table = screen.queryByRole('table')
    if (table) {
      const badges = within(table).getAllByText(/Tidak sesuai|Sesuai|Tidak bisa dicoba|Dilewati/)
      expect(badges.every((b) => b.textContent === 'Tidak sesuai')).toBe(true)
    } else {
      expect(screen.getByText('Tidak ada skenario uji dengan status ini.')).toBeInTheDocument()
    }
  })

  it('shows bug detail with status history and linked executions', async () => {
    const db = createMockDb()
    const defect = db.defects.find((d) => d.source_kind === 'UAT' && d.history.length > 2)
    renderRoute(`${P}/bugs/${defect?.id}`)
    expect((await screen.findAllByText(defect?.bug_code ?? '')).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Riwayat status' })).toBeInTheDocument()
    expect(screen.getByText('Dibuat dengan status Baru dilaporkan')).toBeInTheDocument()
    expect(screen.getAllByText(/Percobaan #1/).length).toBeGreaterThan(0)
  })

  it('shows not-found for a bug id that belongs to another project', async () => {
    const db = createMockDb()
    const otherProject = db.projects.find((p) => p.project_code === 'DEMO-LATIH')
    const foreign = db.defects.find((d) => d.projectId === otherProject?.id)
    renderRoute(`${P}/bugs/${foreign?.id}`)
    expect(await screen.findByText('Data tidak ditemukan di proyek ini.')).toBeInTheDocument()
  })
})
