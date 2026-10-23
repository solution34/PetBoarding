import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import { nowIso } from '../lib/dates.js'
import { withTransaction } from '../db/index.js'
import { serializeCareTask } from '../serialize.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { CareTaskRow, StayRow } from '../types.js'

export function createCareTasksRouter(ctx: AppContext): Router {
  const router = Router()

  router.post('/:id/complete', requireAuth, requireRole('staff'), (req, res) => {
    const taskId = Number(req.params.id)
    if (!Number.isInteger(taskId) || taskId <= 0) throw ApiError.validation('任务编号不合法')
    const task = ctx.db.prepare('SELECT * FROM care_tasks WHERE id = ?').get(taskId) as unknown as
      | CareTaskRow
      | undefined
    if (!task) throw ApiError.notFound('照护任务不存在')
    if (task.status !== 'pending') throw ApiError.invalidState('该照护任务当前状态不可完成')

    const stay = ctx.db.prepare('SELECT * FROM stays WHERE id = ?').get(task.stay_id) as unknown as
      | StayRow
      | undefined
    if (!stay || stay.check_out_at) {
      throw ApiError.invalidState('宠物已离店，不能完成照护任务')
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    if (!notes) throw ApiError.validation('请填写完成记录', 'notes')

    const updated = withTransaction(ctx.db, () => {
      const current = ctx.db.prepare('SELECT * FROM care_tasks WHERE id = ?').get(taskId) as unknown as CareTaskRow
      if (current.status !== 'pending') throw ApiError.invalidState('该照护任务当前状态不可完成')
      const completedAt = nowIso()
      ctx.db
        .prepare(
          `INSERT INTO care_records (task_id, staff_id, completed_at, notes) VALUES (?, ?, ?, ?)`
        )
        .run(taskId, req.account!.id, completedAt, notes)
      ctx.db.prepare(`UPDATE care_tasks SET status = 'completed' WHERE id = ?`).run(taskId)
      return ctx.db.prepare('SELECT * FROM care_tasks WHERE id = ?').get(taskId) as unknown as CareTaskRow
    })

    res.json({ task: serializeCareTask(ctx.db, updated) })
  })

  return router
}
