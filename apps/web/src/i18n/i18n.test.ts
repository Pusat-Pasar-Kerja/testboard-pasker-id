import { describe, expect, it } from 'vitest'
import en from './locales/en/common.json'
import id from './locales/id/common.json'

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
    {},
  )
}

describe('translations (TB-I18N-001)', () => {
  const idKeys = flatten(id)
  const enKeys = flatten(en)

  it('Indonesian and English define exactly the same keys', () => {
    expect(Object.keys(enKeys).sort()).toEqual(Object.keys(idKeys).sort())
  })

  it('has no empty labels', () => {
    for (const [key, text] of [...Object.entries(idKeys), ...Object.entries(enKeys)]) {
      expect(text.trim(), key).not.toBe('')
    }
  })

  it('keeps interpolation placeholders identical in both languages', () => {
    const placeholders = (text: string) => (text.match(/{{\s*\w+\s*}}/g) ?? []).sort()
    for (const key of Object.keys(idKeys)) {
      expect(placeholders(enKeys[key] ?? ''), key).toEqual(placeholders(idKeys[key] ?? ''))
    }
  })

  it('uses the status labels from the blueprint (doc 10)', () => {
    expect(idKeys['codes.execution.PASSED']).toBe('Berhasil Diuji')
    expect(idKeys['codes.execution.NOT_RUN']).toBe('Belum Diuji')
    expect(enKeys['codes.defectStatus.READY_FOR_RETEST']).toBe('Ready for Retest')
  })
})
