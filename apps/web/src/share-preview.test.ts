import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Link previews (owner, 2026-11-24: "tiap link di-share muncul thumbnail"): the card lives in
// index.html, the pictures in public/ (made by scripts/make-share-image.mjs).
// Plain paths: Vite rewrites the new URL(..., import.meta.url) form into asset links.
const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(join(web, 'index.html'), 'utf8')

function png(name: string) {
  const url = join(web, 'public', name)
  const data = readFileSync(url)
  return {
    kind: data.subarray(1, 4).toString('ascii'),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    bytes: statSync(url).size,
  }
}

describe('link preview card (WhatsApp, Telegram, Facebook, LinkedIn, X)', () => {
  it('has a title, a description and a picture with a full address', () => {
    for (const tag of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image']) {
      expect(html).toContain(`property="${tag}"`)
    }
    // %SITE_URL% becomes https://<domain>/testboard/ at build time (vite.config.ts).
    expect(html).toContain('content="%SITE_URL%og-image.png"')
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('name="description"')
    // Every page shares this file: an og:url would turn every shared link into the home page.
    expect(html).not.toContain('property="og:url"')
  })

  it('ships a picture WhatsApp accepts: PNG, 1200 x 630, well under 300 KB', () => {
    const image = png('og-image.png')
    expect(image.kind).toBe('PNG')
    expect([image.width, image.height]).toEqual([1200, 630])
    expect(image.bytes).toBeLessThan(300 * 1024)
  })

  it('ships the phone icon', () => {
    const icon = png('apple-touch-icon.png')
    expect(icon.kind).toBe('PNG')
    expect([icon.width, icon.height]).toEqual([180, 180])
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"')
  })
})
