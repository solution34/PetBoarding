import type { DatabaseSync } from 'node:sqlite'
import type { Account, AccountRow, Role } from '../types.js'
import { createSessionToken } from './passwords.js'
import { nowIso } from './dates.js'

export interface AuthSession {
  token: string
  account: Account
  expiresAt: string
}

export function parseRoles(raw: string): Role[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((role): role is Role => role === 'owner' || role === 'staff' || role === 'admin')
  } catch {
    return []
  }
}

export function serializeAccount(row: AccountRow): Account {
  return {
    id: row.id,
    displayName: row.display_name,
    loginName: row.login_name,
    roles: parseRoles(row.roles)
  }
}

export function findSession(db: DatabaseSync, token: string): AuthSession | null {
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, a.id, a.display_name, a.login_name, a.roles
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token = ?`
    )
    .get(token) as
    | { token: string; expires_at: string; id: number; display_name: string; login_name: string; roles: string }
    | undefined
  if (!row) return null
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  return {
    token: row.token,
    expiresAt: row.expires_at,
    account: serializeAccount({
      id: row.id,
      display_name: row.display_name,
      login_name: row.login_name,
      roles: row.roles,
      password_hash: ''
    })
  }
}

export function createSession(
  db: DatabaseSync,
  accountId: number,
  maxAgeMs: number
): { token: string; expiresAt: string } {
  const token = createSessionToken()
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + maxAgeMs).toISOString()
  db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    accountId,
    createdAt,
    expiresAt
  )
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(createdAt)
  return { token, expiresAt }
}

export function deleteSession(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}
