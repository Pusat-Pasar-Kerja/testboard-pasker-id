import { hash, verify } from '@node-rs/argon2'

/**
 * Argon2id with the OWASP-recommended minimum (19 MiB memory, 2 iterations, 1 lane).
 * Never store or log plaintext passwords (doc 09).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

/**
 * Verified against when the e-mail does not exist, so a wrong e-mail and a wrong password
 * take the same time (no account enumeration by timing).
 */
let dummyHash: Promise<string> | null = null
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('testboard-timing-equaliser')
  return dummyHash
}
