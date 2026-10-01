import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

// argon2id with OWASP minimum parameters.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export const hashPassword = (plain: string) => argon2.hash(plain, OPTIONS)

export async function verifyPassword(hash: string, plain: string) {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    return false
  }
}

/** Computed once so unknown-user logins take as long as wrong-password logins. */
let dummyHash: Promise<string> | null = null
export const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))

/** Temporary password shown once to the admin: readable, 12 chars, no ambiguous characters. */
export function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`
}
