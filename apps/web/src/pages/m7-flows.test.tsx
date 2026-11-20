import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockDb, type MockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

function withDb(mutate?: (db: MockDb) => void, superAdmin = true) {
  const db = createMockDb()
  mutate?.(db)
  return { db, dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin }) }
}

/** jsdom has no object URLs: capture the exported file instead of downloading it. */
function captureDownloads() {
  const files: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    files.push(blob as Blob)
    return 'blob:mock'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return files
}

afterEach(() => vi.restoreAllMocks())

/** jsdom's Blob has no text()/arrayBuffer(); FileReader works. */
const readBytes = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

describe('reports (S09, TB-REPORT-001)', () => {
  it('shows latest-status figures with their definitions and filters by module', async () => {
    const user = userEvent.setup()
    const { dataSource } = withDb()
    const { router } = renderRoute(`${P}/reports`, { dataSource })
    expect(await screen.findByRole('heading', { level: 1, name: 'Laporan' })).toBeInTheDocument()
    expect(await screen.findByText('Test case dalam run')).toBeInTheDocument()
    expect(screen.getByText('Cara menghitung')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Per modul' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Per penguji' })).toBeInTheDocument()

    const moduleFilter = screen.getByLabelText('Modul')
    const firstModule = within(moduleFilter).getAllByRole('option')[1] as HTMLOptionElement
    await user.selectOptions(moduleFilter, firstModule.value)
    await waitFor(() =>
      expect(router.state.location.search).toContain(`module=${firstModule.value}`),
    )
    const table = (await screen.findByRole('heading', { name: 'Per modul' })).closest(
      'section',
    ) as HTMLElement
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2))

    await user.type(screen.getByLabelText('Dari tanggal'), '2026-08-10')
    await user.type(screen.getByLabelText('Sampai tanggal'), '2026-08-01')
    expect(
      await screen.findByText(/Tanggal akhir lebih awal dari tanggal awal/),
    ).toBeInTheDocument()
  })

  it('exports bugs as CSV in the chosen language and records it in the activity log', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    const { dataSource } = withDb()
    renderRoute(`${P}/reports`, { dataSource })

    await user.click(await screen.findByRole('radio', { name: /Daftar bug/ }))
    await user.click(screen.getByRole('radio', { name: 'CSV' }))
    await user.selectOptions(screen.getByLabelText('Bahasa label'), 'en')
    await user.click(screen.getByRole('button', { name: 'Unduh' }))

    expect(
      await screen.findByText(/testboard-DEMO-KARIR-defects-\d{8}-\d{4}\.csv diunduh/),
    ).toBeInTheDocument()
    expect(files).toHaveLength(1)
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await readBytes(files[0] as Blob),
    )
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text.slice(1).split('\r\n')[0]).toMatch(/^Bug code,Title,Severity,Priority,Status/)

    await user.click(screen.getByRole('tab', { name: 'Log aktivitas' }))
    const log = (await screen.findByRole('heading', { name: 'Log aktivitas' })).closest(
      'section',
    ) as HTMLElement
    expect(await within(log).findByText('Diekspor', { selector: 'span' })).toBeInTheDocument()
    await user.selectOptions(within(log).getByLabelText('Jenis data'), 'report')
    await waitFor(() =>
      expect(
        within(log)
          .getAllByRole('listitem')
          .every((li) => /Laporan/.test(li.textContent ?? '')),
      ).toBe(true),
    )
  })

  it('exports a real XLSX workbook', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    const { dataSource } = withDb()
    renderRoute(`${P}/reports`, { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Unduh' }))
    await screen.findByText(/results-\d{8}-\d{4}\.xlsx diunduh/)
    const bytes = await readBytes(files[0] as Blob)
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(files[0]?.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('keeps export and the activity log for leads only', async () => {
    const { dataSource } = withDb((db) => {
      db.currentUserId = '3'
    }, false)
    renderRoute(`${P}/reports`, { dataSource })
    expect(await screen.findByText('Test case dalam run')).toBeInTheDocument()
    expect(
      screen.getByText('Ekspor data hanya bisa dilakukan oleh QA Lead atau Admin proyek.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unduh' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Log aktivitas' })).toBeNull()
  })
})
