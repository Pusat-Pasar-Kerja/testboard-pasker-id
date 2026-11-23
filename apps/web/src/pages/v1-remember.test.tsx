import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '../lib/user-agent'
import type { DataSource } from '../services/data-source'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/** Signed out until login; records whether "Selalu login di perangkat ini" was ticked. */
function httpLike(calls: { remember?: boolean }[]): DataSource {
  const base = createMockDataSource({ latencyMs: 0 })
  let signedIn = false
  return {
    ...base,
    kind: 'http',
    getCurrentUser: () => (signedIn ? base.getCurrentUser() : Promise.resolve(null)),
    login: async (_email, _password, remember) => {
      calls.push({ remember })
      signedIn = true
      return (await base.getCurrentUser()) as NonNullable<
        Awaited<ReturnType<DataSource['getCurrentUser']>>
      >
    },
  }
}

describe('"Selalu login di perangkat ini" (ADR 0015)', () => {
  it('explains the option and sends it with the sign-in', async () => {
    const user = userEvent.setup()
    const calls: { remember?: boolean }[] = []
    const { router } = renderRoute('/login', { dataSource: httpLike(calls) })

    const box = await screen.findByRole('checkbox', { name: 'Selalu login di perangkat ini' })
    expect(box).not.toBeChecked()
    // Only the short label (owner request): no explanation under it.
    expect(screen.queryByText(/Tetap masuk selama/)).toBeNull()

    await user.type(screen.getByLabelText(/^Email/), 'admin@demo.invalid')
    await user.type(screen.getByLabelText(/^Kata sandi/), 'benar-sekali-12')
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
    expect(calls).toEqual([{ remember: true }])
  })

  it('shows signed-in devices and signs out the others after confirmation', async () => {
    const user = userEvent.setup()
    const base = createMockDataSource({ latencyMs: 0 })
    let revoked = false
    const dataSource: DataSource = {
      ...base,
      listMySessions: async () => [
        {
          key: 'aaaaaaaaaaaaaaaa',
          current: true,
          remembered: true,
          user_agent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          created_at: '2026-11-20T01:00:00.000Z',
          last_seen_at: '2026-11-22T01:00:00.000Z',
          expires_at: '2026-12-20T01:00:00.000Z',
        },
        ...(revoked
          ? []
          : [
              {
                key: 'bbbbbbbbbbbbbbbb',
                current: false,
                remembered: false,
                user_agent:
                  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
                created_at: '2026-11-21T01:00:00.000Z',
                last_seen_at: '2026-11-21T02:00:00.000Z',
                expires_at: '2026-11-21T13:00:00.000Z',
              },
            ]),
      ],
      revokeOtherSessions: async () => {
        revoked = true
      },
    }
    renderRoute('/profile', { dataSource })

    const section = (
      await screen.findByRole('heading', { name: 'Perangkat yang sedang masuk' })
    ).closest('section') as HTMLElement
    expect(await within(section).findByText('Chrome · Windows')).toBeInTheDocument()
    expect(within(section).getByText('Chrome · Android')).toBeInTheDocument()
    expect(within(section).getByText('Perangkat ini')).toBeInTheDocument()
    expect(within(section).getByText(/Diingat sampai/)).toBeInTheDocument()

    await user.click(
      within(section).getByRole('button', { name: 'Keluar dari semua perangkat lain' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('1 perangkat lain akan keluar')
    await user.click(
      within(dialog).getByRole('button', { name: 'Keluar dari semua perangkat lain' }),
    )
    expect(await screen.findByText('Semua perangkat lain sudah dikeluarkan.')).toBeInTheDocument()
    await waitFor(() => expect(within(section).queryByText('Chrome · Android')).toBeNull())
  })
})

describe('describeUserAgent', () => {
  it('names common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS', mobile: true })
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows', mobile: false })
    expect(describeUserAgent('')).toEqual({ browser: null, os: null, mobile: false })
  })
})
