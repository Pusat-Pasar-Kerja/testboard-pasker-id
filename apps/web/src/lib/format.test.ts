import { describe, expect, it } from 'vitest'
import { formatDateTime } from './format'

describe('formatDateTime', () => {
  it('renders UTC timestamps in Asia/Jakarta (UTC+7) with a zone label', () => {
    const iso = '2026-11-20T01:02:03.000Z' // 08:02:03 WIB
    const id = formatDateTime(iso, 'id')
    const en = formatDateTime(iso, 'en')
    expect(id).toMatch(/08[.:]02[.:]03/)
    expect(en).toMatch(/08:02:03/)
    expect(id).toMatch(/2026/)
    expect(en).toMatch(/GMT\+7|WIB/)
  })

  it('returns the raw value for an invalid date instead of throwing', () => {
    expect(formatDateTime('not-a-date', 'id')).toBe('not-a-date')
  })
})
