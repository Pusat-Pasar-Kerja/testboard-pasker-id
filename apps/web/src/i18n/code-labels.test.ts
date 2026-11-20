import { CODE_LABELS, type CodeGroup } from '@testboard/shared'
import { describe, expect, it } from 'vitest'
import en from './locales/en/common.json'
import id from './locales/id/common.json'

describe('export labels', () => {
  it('match the labels shown in the app, in both languages', () => {
    for (const [locale, messages] of [
      ['id', id],
      ['en', en],
    ] as const) {
      for (const group of Object.keys(CODE_LABELS) as CodeGroup[]) {
        expect(messages.codes[group], `${locale} codes.${group}`).toMatchObject(
          CODE_LABELS[group][locale],
        )
      }
    }
  })
})
