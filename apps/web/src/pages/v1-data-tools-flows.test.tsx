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
    await user.selectOptions(within(bar).getByLabelText('Yang diubah'), 'Severity')
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
    await user.selectOptions(within(bar).getByLabelText('Nilai baru'), 'Ditutup')
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
    await screen.findByRole('option', { name: label })
    await user.selectOptions(screen.getByLabelText('Siklus'), label)
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
    const dialog = await screen.findByRole('alertdialog', { name: 'Arsipkan 1 test case?' })
    await user.click(within(dialog).getByRole('button', { name: 'Arsipkan' }))
    await waitFor(() => expect(target.case_status).toBe('ARCHIVED'))
  })
})
