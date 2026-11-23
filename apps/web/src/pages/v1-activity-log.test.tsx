import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { BulkReport } from '../components/ui/BulkBar'
import { createI18n } from '../i18n'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

function setup() {
  const db = createMockDb()
  return { db, dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin: true }) }
}

async function openLog() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name: 'Log aktivitas' }))
  const log = (await screen.findByRole('heading', { name: 'Log aktivitas' })).closest(
    'section',
  ) as HTMLElement
  await within(log).findAllByRole('listitem')
  return { user, log }
}

describe('activity log in plain words (audit 2026-11-24)', () => {
  it('names items by code, shows status changes in words, never column names or ids', async () => {
    const { db, dataSource } = setup()
    renderRoute(`${P}/reports`, { dataSource })
    const { user, log } = await openLog()

    const link = within(log).getAllByRole('link', { name: /^Buka BUG-/ })[0] as HTMLElement
    const bug = db.defects.find((d) => link.textContent?.startsWith(`${d.bug_code} · `))
    expect(bug).toBeDefined()
    expect(link).toHaveAttribute('href', `${P}/bugs/${bug?.id}`)
    expect(within(log).getAllByText('Status:').length).toBeGreaterThan(0)

    const created = within(log)
      .getAllByRole('listitem')
      .find((li) => /Dibuat/.test(li.textContent ?? '') && /Masalah/.test(li.textContent ?? ''))
    expect(created).toBeDefined()
    await user.click(
      within(created as HTMLElement).getByText(
        'Lihat 3 perubahan: Kode masalah, Judul, Tingkat dampak',
      ),
    )
    expect(within(created as HTMLElement).getByText('Tingkat dampak')).toBeVisible()

    const text = log.textContent ?? ''
    expect(text).not.toMatch(/status_code|severity_code|bug_code|result_status/)
    expect(text).not.toMatch(/\s#\d+/)
    expect(text).not.toMatch(/\{"/)
  })

  it('shows site settings changes with their labels on the website log', async () => {
    const { dataSource } = setup()
    await dataSource.updateSiteSettings({ 'site.support_contact': 'Tim SIPK' })
    renderRoute('/admin/audit', { dataSource })
    const user = userEvent.setup()
    const summary = await screen.findByText('Lihat 1 perubahan: Kontak bantuan')
    await user.click(summary)
    expect(screen.getByText('Tim SIPK')).toBeVisible()
    expect(document.body.textContent).not.toMatch(/site\.support_contact/)
  })
})

describe('bulk action report', () => {
  it('names an item without a code in words, never by its database id', () => {
    render(
      <I18nextProvider i18n={createI18n('id')}>
        <BulkReport
          result={{
            updated: 1,
            unchanged: 0,
            skipped: [{ id: '98765', code: '', reason: 'NOT_FOUND' }],
          }}
          onClose={() => {}}
        />
      </I18nextProvider>,
    )
    expect(
      screen.getByText(/Satu data yang dipilih: tidak ditemukan, mungkin sudah dihapus/),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('98765')
  })
})
