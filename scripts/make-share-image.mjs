#!/usr/bin/env node
/**
 * Link preview pictures (WhatsApp, Telegram, Facebook, LinkedIn, X), owner 2026-11-24:
 *   apps/web/public/og-image.png          1200 x 630, shown with every shared link
 *   apps/web/public/apple-touch-icon.png  180 x 180, phone home screens and some previews
 *
 * Drawn from the brand itself (mark geometry from mark-geometry.ts, Inter from
 * node_modules) in headless Chrome or Edge, so the picture always matches the logo.
 * Run again after a brand change:   npm run brand:share-image
 * Env: CHROME_PATH when the browser is not in a usual place.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'apps/web/public')

// ---------------------------------------------------------------- brand sources
const geometry = readFileSync(join(root, 'apps/web/src/components/brand/mark-geometry.ts'), 'utf8')
function constant(name) {
  const match = geometry.match(new RegExp(`${name} = '([^']+)'`))
  if (!match) throw new Error(`${name} not found in mark-geometry.ts`)
  return match[1]
}
const dotMatch = geometry.match(/MARK_DOT = \{ cx: ([\d.]+), cy: ([\d.]+), r: ([\d.]+) \}/)
const strokeMatch = geometry.match(/MARK_STROKE_WIDTH = (\d+)/)
if (!dotMatch || !strokeMatch) throw new Error('mark geometry not found')
const MARK = {
  viewBox: constant('MARK_VIEWBOX'),
  arc: constant('MARK_ARC_PATH'),
  color: constant('MARK_COLOR'),
  accent: constant('MARK_ACCENT'),
  stroke: strokeMatch[1],
  dot: { cx: dotMatch[1], cy: dotMatch[2], r: dotMatch[3] },
}
const inter = readFileSync(
  join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'),
).toString('base64')

function mark(size, arcColor) {
  return `<svg viewBox="${MARK.viewBox}" width="${size}" height="${size}" fill="none" aria-hidden="true">
    <path d="${MARK.arc}" stroke="${arcColor}" stroke-width="${MARK.stroke}" stroke-linecap="round"/>
    <circle cx="${MARK.dot.cx}" cy="${MARK.dot.cy}" r="${MARK.dot.r}" fill="${MARK.accent}"/>
  </svg>`
}

function page(width, height, css, body) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
    @font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${inter}) format('woff2'); }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
    ${css}
  </style></head><body>${body}</body></html>`
}

// ---------------------------------------------------------------- the pictures
// Everything important sits in the middle, so a square crop (some chat apps) still shows
// the whole logo.
const ogImage = page(
  1200,
  630,
  `
  .card { position: relative; width: 1200px; height: 630px; overflow: hidden; color: #fff;
    /* Top to bottom: every row is one colour, which keeps the file small (WhatsApp). */
    background: linear-gradient(180deg, #17569a 0%, #15406a 100%); }
  .line { position: absolute; inset: 0 0 auto 0; height: 10px;
    background: linear-gradient(90deg, #2f9fe8, #10a493); }
  .glow { position: absolute; border-radius: 50%; }
  .glow.a { width: 560px; height: 560px; right: -170px; top: -230px; background: rgba(16, 164, 147, 0.16); }
  .glow.b { width: 440px; height: 440px; left: -160px; bottom: -200px; background: rgba(61, 134, 209, 0.24); }
  .content { position: absolute; inset: 10px 0 70px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 30px; }
  .lockup { display: flex; align-items: center; gap: 24px; }
  .words { display: flex; flex-direction: column; line-height: 1; }
  .name { font-size: 96px; letter-spacing: -0.035em; white-space: nowrap; }
  .name b { font-weight: 800; }
  .name span { font-weight: 300; }
  .by { align-self: flex-end; margin-top: 8px; font-size: 26px; font-weight: 600; color: rgba(255, 255, 255, 0.78); }
  .tagline { margin: 0; font-size: 38px; font-weight: 600; text-align: center; }
  .chips { display: flex; gap: 14px; }
  .chip { padding: 10px 22px; border-radius: 999px; font-size: 24px; font-weight: 600;
    background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.22); }
  .foot { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font-size: 22px;
    font-weight: 500; color: rgba(255, 255, 255, 0.74); }
  `,
  `<div class="card">
    <div class="line"></div>
    <div class="glow a"></div>
    <div class="glow b"></div>
    <div class="content">
      <div class="lockup">
        ${mark(134, '#ffffff')}
        <div class="words">
          <div class="name"><b>Test</b><span>Board</span></div>
          <div class="by">oleh PASKER ID</div>
        </div>
      </div>
      <p class="tagline">Uji layanan bersama pengguna sebelum dipakai masyarakat</p>
      <div class="chips">
        <span class="chip">Skenario uji</span>
        <span class="chip">UAT bersama</span>
        <span class="chip">Laporan masalah</span>
      </div>
    </div>
    <div class="foot">Pusat Pasar Kerja · Kementerian Ketenagakerjaan Republik Indonesia</div>
  </div>`,
)

const touchIcon = page(
  180,
  180,
  `.icon { width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; background: #ffffff; }`,
  `<div class="icon">${mark(128, MARK.color)}</div>`,
)

// ---------------------------------------------------------------- rendering
const browser = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => path && existsSync(path))
if (!browser) throw new Error('Chrome or Edge not found; set CHROME_PATH')

function pngSize(file) {
  const data = readFileSync(file)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

function render(html, width, height, out) {
  const dir = mkdtempSync(join(tmpdir(), 'testboard-share-'))
  try {
    const file = join(dir, 'page.html')
    writeFileSync(file, html)
    rmSync(out, { force: true })
    spawnSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=1',
        // Give the embedded font time to load before the picture is taken.
        '--virtual-time-budget=3000',
        `--user-data-dir=${join(dir, 'profile')}`,
        `--window-size=${width},${height}`,
        `--screenshot=${out}`,
        pathToFileURL(file).href,
      ],
      { stdio: 'ignore' },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  if (!existsSync(out)) throw new Error(`no picture made: ${out}`)
  const size = pngSize(out)
  if (size.width !== width || size.height !== height) {
    throw new Error(`${out} is ${size.width}x${size.height}, expected ${width}x${height}`)
  }
  console.log(`${out}  ${width}x${height}  ${Math.round(statSync(out).size / 1024)} KB`)
}

render(ogImage, 1200, 630, join(publicDir, 'og-image.png'))
render(touchIcon, 180, 180, join(publicDir, 'apple-touch-icon.png'))
