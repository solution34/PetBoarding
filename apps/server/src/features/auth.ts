import { Router } from 'express'
import type { AppContext } from '../context.js'
import { SESSION_MAX_AGE_MS } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { verifyPassword } from '../lib/passwords.js'
import { createSession, deleteSession, serializeAccount } from '../lib/session.js'
import { SESSION_COOKIE, clearSessionCookie, serializeCookie } from '../lib/cookies.js'
import { requireAuth } from '../middleware/auth.js'
import type { AccountRow } from '../types.js'

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router()

  router.post('/login', (req, res) => {
    const body = req.body as { loginName?: unknown; password?: unknown } | undefined
    const loginName = typeof body?.loginName === 'string' ? body.loginName.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!loginName || !password) {
      throw ApiError.validation('请输入登录名和密码')
    }

    const row = ctx.db
      .prepare('SELECT * FROM accounts WHERE login_name = ?')
      .get(loginName) as AccountRow | undefined
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw ApiError.loginFailed()
    }

    const { token } = createSession(ctx.db, row.id, SESSION_MAX_AGE_MS)
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE, token, {
        maxAgeSeconds: Math.floor(SESSION_MAX_AGE_MS / 1000),
        httpOnly: true,
        sameSite: 'Lax'
      })
    )
    res.json({ account: serializeAccount(row) })
  })

  router.post('/logout', requireAuth, (req, res) => {
    if (req.sessionToken) deleteSession(ctx.db, req.sessionToken)
    res.setHeader('Set-Cookie', clearSessionCookie())
    res.status(204).end()
  })

  router.get('/me', requireAuth, (req, res) => {
    res.json({ account: req.account })
  })

  return router
}
