import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_PREFIX = 'scrypt'
const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${SCRYPT_PREFIX}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false
  const [, salt, expectedHex] = parts
  if (!salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== KEY_LENGTH) return false
  const actual = scryptSync(password, salt, KEY_LENGTH)
  return timingSafeEqual(actual, expected)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('hex')
}
