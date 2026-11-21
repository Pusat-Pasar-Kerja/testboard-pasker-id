import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MARK_ACCENT,
  MARK_BOARD,
  MARK_CHECK_PATH,
  MARK_COLOR,
  MARK_DOT,
  MARK_STROKE_WIDTH,
  MARK_VIEWBOX,
} from './mark-geometry'

// The symbol exists in three places; guard against them drifting apart.
const files = ['../../../public/favicon.svg', '../../../../../docs/brand/testboard-mark.svg']

describe('TestBoard mark geometry is identical everywhere', () => {
  it.each(files)('%s', (relative) => {
    const svg = readFileSync(new URL(relative, import.meta.url), 'utf8')
    expect(svg).toContain(`viewBox="${MARK_VIEWBOX}"`)
    expect(svg).toContain(`cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${MARK_DOT.r}"`)
    const b = MARK_BOARD
    expect(svg).toContain(
      `x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}"`,
    )
    expect(svg).toContain(`d="${MARK_CHECK_PATH}"`)
    expect(svg).toContain(`stroke-width="${MARK_STROKE_WIDTH}"`)
    expect(svg).toContain(MARK_COLOR)
    expect(svg).toContain(MARK_ACCENT)
  })
})
