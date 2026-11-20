import sharp from 'sharp'
import { crc32 } from 'node:zlib'

/** Raw RGB pixels of a fake UI screen: flat panels, buttons and thin "text" strokes. */
export function uiPixels(width = 900, height = 560): Buffer {
  const px = Buffer.alloc(width * height * 3, 0xff)
  const fill = (x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) => {
    for (let y = y0; y < Math.min(height, y0 + h); y++) {
      for (let x = x0; x < Math.min(width, x0 + w); x++) {
        const i = (y * width + x) * 3
        px[i] = rgb[0]
        px[i + 1] = rgb[1]
        px[i + 2] = rgb[2]
      }
    }
  }
  fill(0, 0, width, 56, [67, 97, 214]) // top bar
  fill(0, 56, 200, height - 56, [243, 246, 254]) // sidebar
  for (let row = 0; row < 18; row++) {
    for (let word = 0; word < 9; word++) {
      fill(230 + word * 70, 90 + row * 24, 50 + ((row * 7 + word * 13) % 17), 2, [31, 37, 51])
    }
  }
  fill(230, 520, 120, 28, [67, 97, 214]) // button
  return px
}

/** A large, barely compressed PNG like many screenshot tools produce. */
export const uiPng = () =>
  sharp(uiPixels(), { raw: { width: 900, height: 560, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()

/** JPEG photo-like screenshot carrying EXIF with a GPS position. */
export const jpegWithGps = () =>
  sharp(uiPixels(), { raw: { width: 900, height: 560, channels: 3 } })
    .jpeg({ quality: 97 })
    .withExif({
      IFD0: { Copyright: 'Lokasi-Rahasia-Penguji' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1' },
    })
    .toBuffer()

export const pdf = (extra = '') =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${extra}>> endobj\n` +
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\n' +
      'trailer << /Root 1 0 R >>\n%%EOF\n',
    'latin1',
  )

/** Stored (uncompressed) ZIP; `declared` overrides the size a bomb would claim. */
export function zip(entries: { name: string; data: Buffer | string; declared?: number }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const data = Buffer.from(entry.data)
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(entry.declared ?? data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export const docx = (extra: { name: string; data: string; declared?: number }[] = []) =>
  zip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
    { name: 'word/document.xml', data: '<w:document><w:body>Bukti UAT</w:body></w:document>' },
    ...extra,
  ])

export const harWithSecrets = () =>
  JSON.stringify({
    log: {
      version: '1.2',
      entries: Array.from({ length: 30 }, (_, i) => ({
        request: {
          method: 'GET',
          url: `https://staging.demo.invalid/api/items/${i}?page=1`,
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'Cookie', value: 'tb_session=SESSION-SECRET-123' },
            { name: 'Authorization', value: 'Bearer TOKEN-SECRET-456' },
          ],
          cookies: [{ name: 'tb_session', value: 'SESSION-SECRET-123' }],
          queryString: [
            { name: 'page', value: '1' },
            { name: 'access_token', value: 'QUERY-SECRET-789' },
          ],
        },
        response: {
          status: 200,
          headers: [{ name: 'Set-Cookie', value: 'tb_csrf=CSRF-SECRET-000' }],
          cookies: [],
        },
      })),
    },
  })

/** Standard antivirus test signature, assembled so this file is not itself flagged. */
export const eicar = () =>
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join('')

/** Photo-like noisy pixels: many colours, big even when lossless. */
export function noisePixels(width = 1200, height = 800): Buffer {
  const px = Buffer.alloc(width * height * 3)
  let seed = 42
  for (let i = 0; i < px.length; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
    px[i] = seed >> 23
  }
  return px
}

export const noisyPng = () =>
  sharp(noisePixels(), { raw: { width: 1200, height: 800, channels: 3 } })
    .png()
    .toBuffer()
