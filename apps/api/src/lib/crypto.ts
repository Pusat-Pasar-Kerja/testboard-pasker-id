import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 256-bit random token, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Constant-time comparison of two hex digests / tokens. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Readable temporary password (no ambiguous characters), ~120 bits of entropy. */
export function temporaryPassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[(bytes[i] ?? 0) % alphabet.length]
  return out
}
