/**
 * Key for the `Idempotency-Key` header: one per intended save, reused on retry, so a
 * double click or a retried request never records two attempts (ADR 0006).
 */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
