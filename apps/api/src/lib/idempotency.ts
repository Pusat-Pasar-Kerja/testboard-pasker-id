/**
 * Small in-memory idempotency store (doc 02: repeated sensitive operations must not create
 * duplicates). A retried request with the same `Idempotency-Key` from the same user returns
 * the first response instead of creating a second record. The API runs as one process on
 * the VPS, so memory is sufficient; entries expire after 10 minutes.
 */
const TTL_MS = 10 * 60_000
const MAX_ENTRIES = 5000

interface Entry {
  expires: number
  status: number
  body: unknown
}

export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>()

  static key(scope: string, userId: string, header: string | undefined): string | null {
    if (!header) return null
    const trimmed = header.trim()
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(trimmed)) return null
    return `${scope}:${userId}:${trimmed}`
  }

  get(key: string): Entry | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expires < Date.now()) {
      this.entries.delete(key)
      return null
    }
    return entry
  }

  set(key: string, status: number, body: unknown): void {
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { expires: Date.now() + TTL_MS, status, body })
  }
}
