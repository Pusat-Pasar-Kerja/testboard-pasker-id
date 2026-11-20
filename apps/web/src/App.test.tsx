import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { ApiClientError } from './services/api-client'
import type { DataSource } from './services/data-source'
import { renderWithProviders } from './test/render'

describe('App (Milestone 0 foundation)', () => {
  it('renders in Indonesian by default with the demo badge and mock API health', async () => {
    renderWithProviders(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'TestBoard PASKER ID' })).toBeVisible()
    expect(screen.getByText('DEMO - data contoh fiktif')).toBeVisible()
    expect(await screen.findByText('Normal')).toBeVisible()
    expect(screen.getByText('Belum dikonfigurasi')).toBeVisible()
    expect(document.documentElement.lang).toBe('id')
  })

  it('switches every label to English without reloading and remembers the choice', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)
    await screen.findByText('Normal')

    await user.click(screen.getByRole('button', { name: /English/ }))

    expect(screen.getByText('Application foundation ready')).toBeVisible()
    expect(screen.getByText('Healthy')).toBeVisible()
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('tb.locale')).toBe('en')
  })

  it('shows a translated error with the reference code when the API fails', async () => {
    const failing: DataSource = {
      kind: 'http',
      getHealth: () => Promise.reject(new ApiClientError(500, 'INTERNAL_ERROR', 'boom', 'req-xyz')),
    }
    renderWithProviders(<App />, { dataSource: failing })

    expect(await screen.findByText('Tidak dapat terhubung')).toBeVisible()
    expect(screen.getByText('Kode referensi: req-xyz')).toBeVisible()
    expect(screen.getByRole('button', { name: /Coba lagi/ })).toBeVisible()
    expect(screen.getByText('Terhubung ke API')).toBeVisible()
  })
})
