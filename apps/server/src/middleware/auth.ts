import type { NextFunction, Request, Response } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { Account, Role } from '../types.js'
import { ApiError } from '../lib/errors.js'
import { parseCookies, SESSION_COOKIE } from '../lib/cookies.js'
import { findSession } from '../lib/session.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: Account
      sessionToken?: string
    }
  }
}

export function attachSession(db: DatabaseSync) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    if (token) {
      const session = findSession(db, token)
      if (session) {
        req.account = session.account
        req.sessionToken = token
      }
    }
    next()
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.account) throw ApiError.unauthenticated()
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.account) throw ApiError.unauthenticated()
    if (!req.account.roles.some((role) => roles.includes(role))) {
      throw ApiError.forbidden()
    }
    next()
  }
}

export function isStaff(account: Account): boolean {
  return account.roles.includes('staff')
}

/** 主人与工作人员可访问业务资源；管理员账号不自动获得业务操作权限。 */
export function requireOwnerOrStaff(req: Request, _res: Response, next: NextFunction): void {
  const account = req.account
  if (!account) throw ApiError.unauthenticated()
  if (account.roles.includes('staff') || account.roles.includes('owner')) {
    next()
    return
  }
  throw ApiError.forbidden()
}

export function assertOwnerAccess(account: Account, ownerId: number): void {
  if (isStaff(account)) return
  if (!account.roles.includes('owner') || account.id !== ownerId) {
    throw ApiError.forbidden('只能访问本人的数据')
  }
}
