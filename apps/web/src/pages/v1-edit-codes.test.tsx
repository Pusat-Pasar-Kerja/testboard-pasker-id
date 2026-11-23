import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

function setup() {
  const db = createMockDb()
  const dataSource = createMockDataSource({ latencyMs: 0, db, superAdmin: true })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  return { db, dataSource, project }
}

describe('changing codes after creation', () => {
  it('renames a project code from the admin console and refuses one already in use', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    renderRoute('/admin/projects', { dataSource })
    const card = (await screen.findByText('Demo Portal Karier')).closest('li') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'Ubah' }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByLabelText(/^Kode proyek/)
    expect(within(dialog).getByText(/link lama tidak bisa dibuka lagi/)).toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'DEMO-LATIH')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await within(dialog).findByText('Sudah dipakai')).toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'karirhub')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await within(card).findByText('KARIRHUB')).toBeInTheDocument()
    expect(project.project_code).toBe('KARIRHUB')
    expect(db.projects.filter((p) => p.project_code === 'DEMO-KARIR')).toHaveLength(0)
  })

  it('renames a module code; existing test case codes keep their prefix', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    const auth = db.modules.find((m) => m.projectId === project.id && m.module_code === 'AUTH')!
    const authCase = db.cases.find((c) => c.moduleId === auth.id)!
    const caseCode = authCase.case_code
    renderRoute('/projects/DEMO-KARIR/settings', { dataSource })

    await user.click(await screen.findByRole('button', { name: 'Ubah fitur AUTH' }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByLabelText(/^Kode fitur/)
    await user.clear(field)
    await user.type(field, 'LOKER')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await within(dialog).findByText('Sudah dipakai')).toBeInTheDocument()

    await user.clear(field)
    await user.type(field, 'login')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Fitur LOGIN disimpan.')).toBeInTheDocument()
    expect(auth.module_code).toBe('LOGIN')
    expect(authCase.case_code).toBe(caseCode)
    const detail = await dataSource.getTestCase('DEMO-KARIR', authCase.id)
    expect(detail.module?.module_code).toBe('LOGIN')
  })

  it('renames a cycle code, title and period', async () => {
    const user = userEvent.setup()
    const { db, dataSource, project } = setup()
    await dataSource.createCycle('DEMO-KARIR', { cycle_code: 'FASE-2', title: 'UAT Fase 2' })
    const cycle = db.cycles.find(
      (cy) => cy.projectId === project.id && cy.cycle_code === 'SIKLUS-1-2026',
    )!
    renderRoute('/projects/DEMO-KARIR/cycles', { dataSource })

    await user.click(await screen.findByRole('button', { name: 'Ubah fase SIKLUS-1-2026' }))
    const dialog = await screen.findByRole('dialog')
    const code = within(dialog).getByLabelText(/^Kode fase/)
    await user.clear(code)
    await user.type(code, 'FASE-2')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await within(dialog).findByText('Sudah dipakai')).toBeInTheDocument()

    await user.clear(code)
    await user.type(code, 'fase-1')
    const title = within(dialog).getByLabelText(/^Judul/)
    await user.clear(title)
    await user.type(title, 'UAT Fase 1')
    await user.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('heading', { name: 'UAT Fase 1' })).toBeInTheDocument()
    expect(cycle).toMatchObject({ cycle_code: 'FASE-1', title: 'UAT Fase 1' })
  })
})
