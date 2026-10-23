import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import { serializeStaySummary } from '../serialize.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { StayRow } from '../types.js'

export function createStaysRouter(ctx: AppContext): Router {
  const router = Router()

  router.get('/', requireAuth, requireRole('staff'), (req, res) => {
    const status = req.query.status ?? 'active'
    if (status !== 'active') throw ApiError.validation('当前仅支持 status=active', 'status')
    const rows = ctx.db
      .prepare('SELECT * FROM stays WHERE check_out_at IS NULL ORDER BY check_in_at, id')
      .all() as unknown as StayRow[]
    res.json({ stays: rows.map((row) => serializeStaySummary(ctx.db, row)) })
  })

  return router
}
