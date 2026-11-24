import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y,
  TEXT_SIZES,
  THEMES,
  applyA11y,
  readA11y,
  setA11y,
} from './a11y'

const root = document.documentElement

afterEach(() => {
  window.localStorage.clear()
  applyA11y(DEFAULT_A11Y)
})

describe('accessibility settings', () => {
  it('applies size, theme and reading options to <html> and keeps them', () => {
    setA11y({
      size: 4,
      theme: 'contrast',
      spacing: true,
      readable: true,
      underline: true,
      reduceMotion: true,
    })
    expect(root.style.fontSize).toBe('140%')
    expect(root.dataset.theme).toBe('contrast')
    expect(root.dataset.spacing).toBe('on')
    expect(root.dataset.readable).toBe('on')
    expect(root.dataset.underline).toBe('on')
    expect(root.getAttribute('data-reduce-motion')).toBe('on')
    expect(readA11y()).toMatchObject({ size: 4, theme: 'contrast', readable: true })

    setA11y({ ...DEFAULT_A11Y })
    expect(root.style.fontSize).toBe('')
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.spacing).toBeUndefined()
  })

  it('takes over the size chosen with the old A-/A/A+ buttons', () => {
    window.localStorage.setItem('tb.font-scale', '1.25')
    expect(readA11y()).toEqual({ ...DEFAULT_A11Y, size: 3 })
  })

  it('ignores damaged stored values', () => {
    window.localStorage.setItem(A11Y_STORAGE_KEY, '{"size":99,"theme":"neon"}')
    expect(readA11y()).toEqual(DEFAULT_A11Y)
  })

  it('is mirrored by the boot script that runs before the app (no white flash)', () => {
    const boot = readFileSync(resolve(process.cwd(), 'public/a11y-boot.js'), 'utf8')
    expect(boot).toContain(`'${A11Y_STORAGE_KEY}'`)
    expect(boot).toContain(`[${TEXT_SIZES.join(', ')}]`)
    for (const theme of THEMES) expect(boot).toContain(`'${theme}'`)
    for (const flag of ['spacing', 'readable', 'underline', 'reduce-motion']) {
      expect(boot).toContain(`data-${flag}`)
    }
  })
})
