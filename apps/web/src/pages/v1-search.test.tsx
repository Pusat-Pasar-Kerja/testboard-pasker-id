import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

function setup() {
  const db = createMockDb()
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  return {
    db,
    project,
    dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin: true }),
  }
}

describe('one search for the whole project (audit 2026-11-24)', () => {
  it('finds a problem by its code from the top bar', async () => {
    const user = userEvent.setup()
    const { db, project, dataSource } = setup()
    const bug = db.defects.find((d) => d.projectId === project.id)!
    const { router } = renderRoute(`${P}/dashboard`, { dataSource })
    const box = await screen.findByRole('searchbox', { name: 'Cari di proyek ini' })
    await user.type(box, `${bug.bug_code}{Enter}`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`${P}/search`))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cari di proyek ini' }),
    ).toBeInTheDocument()
    const problems = (await screen.findByRole('heading', { name: /^Masalah/ })).closest(
      'section',
    ) as HTMLElement
    const link = await within(problems).findByRole('link', { name: new RegExp(bug.bug_code) })
    expect(link).toHaveAttribute('href', `${P}/bugs/${bug.id}`)
  })

  it('shows scenarios, problems and test sheets side by side', async () => {
    const { db, project, dataSource } = setup()
    const run = db.runs.find((r) => r.projectId === project.id)!
    renderRoute(`${P}/search?q=${encodeURIComponent(run.run_code)}`, { dataSource })
    const sheets = (await screen.findByRole('heading', { name: /^UAT/ })).closest(
      'section',
    ) as HTMLElement
    expect(
      await within(sheets).findByRole('link', { name: new RegExp(run.run_code) }),
    ).toHaveAttribute('href', `${P}/runs/${run.id}`)
    expect(screen.getByRole('heading', { name: /^Skenario uji/ })).toBeInTheDocument()
  })

  it('says so in plain words when nothing matches', async () => {
    const { dataSource } = setup()
    renderRoute(`${P}/search?q=zzzz-tidak-ada`, { dataSource })
    expect(
      await screen.findByText(
        'Tidak ada yang cocok dengan "zzzz-tidak-ada". Coba kata lain atau kode lengkapnya.',
      ),
    ).toBeInTheDocument()
  })
})
