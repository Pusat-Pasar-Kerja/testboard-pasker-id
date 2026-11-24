import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { applyA11y, DEFAULT_A11Y } from '../lib/a11y'
import { renderRoute } from '../test/render'

const root = document.documentElement

afterEach(() => applyA11y(DEFAULT_A11Y))

describe('accessibility bundle (owner, 2026-11-24)', () => {
  it('changes theme, text size and reading options from the top bar, and resets them', async () => {
    const user = userEvent.setup()
    renderRoute('/projects')
    await user.click(await screen.findByRole('button', { name: 'Aksesibilitas' }))
    const panel = await screen.findByRole('dialog', { name: 'Aksesibilitas' })

    await user.click(within(panel).getByRole('radio', { name: /Gelap/ }))
    expect(root.dataset.theme).toBe('dark')
    await user.click(within(panel).getByRole('radio', { name: 'Teks paling besar (140%)' }))
    expect(root.style.fontSize).toBe('140%')
    await user.click(within(panel).getByRole('switch', { name: /Huruf mudah dibaca/ }))
    expect(root.dataset.readable).toBe('on')

    await user.click(within(panel).getByRole('button', { name: 'Kembalikan seperti semula' }))
    expect(root.dataset.theme).toBe('light')
    expect(root.style.fontSize).toBe('')
    expect(root.dataset.readable).toBeUndefined()
  })

  it('is on the public pages and the sign-in page too', async () => {
    renderRoute('/publik')
    expect(await screen.findByRole('button', { name: 'Aksesibilitas' })).toBeInTheDocument()
  })
})
