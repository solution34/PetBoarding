import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import { serializeRoom, serializeRoomType } from '../serialize.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { RoomRow, RoomTypeRow } from '../types.js'

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router()
  router.use(requireAuth, requireRole('admin'))

  router.get('/rooms', (_req, res) => {
    const roomTypes = ctx.db
      .prepare('SELECT * FROM room_types ORDER BY id')
      .all() as unknown as RoomTypeRow[]
    const rooms = ctx.db
      .prepare(
        `SELECT r.*,
           (SELECT COUNT(*) FROM reservations v
            WHERE v.room_id = r.id AND v.status IN ('confirmed', 'checked_in')) AS active_count
         FROM rooms r ORDER BY r.room_type_id, r.name`
      )
      .all() as unknown as Array<RoomRow & { active_count: number }>

    res.json({
      roomTypes: roomTypes.map((roomType) => ({
        ...serializeRoomType(roomType),
        rooms: rooms
          .filter((room) => room.room_type_id === roomType.id)
          .map((room) => ({
            ...serializeRoom(room),
            activeReservationCount: Number(room.active_count)
          }))
      }))
    })
  })

  router.put('/room-types/:id', (req, res) => {
    const roomTypeId = Number(req.params.id)
    if (!Number.isInteger(roomTypeId)) throw ApiError.validation('房型编号不合法')
    const roomType = ctx.db.prepare('SELECT * FROM room_types WHERE id = ?').get(roomTypeId) as
      | RoomTypeRow
      | undefined
    if (!roomType) throw ApiError.notFound('房型不存在')

    const body = (req.body ?? {}) as Record<string, unknown>
    const dailyPriceFen = Number(body.dailyPriceFen)
    if (!Number.isInteger(dailyPriceFen) || dailyPriceFen < 0) {
      throw ApiError.validation('日价必须是非负整数（单位：分）', 'dailyPriceFen')
    }
    ctx.db
      .prepare('UPDATE room_types SET daily_price_fen = ? WHERE id = ?')
      .run(dailyPriceFen, roomTypeId)
    const updated = ctx.db
      .prepare('SELECT * FROM room_types WHERE id = ?')
      .get(roomTypeId) as unknown as RoomTypeRow
    res.json({ roomType: serializeRoomType(updated) })
  })

  router.put('/rooms/:id', (req, res) => {
    const roomId = Number(req.params.id)
    if (!Number.isInteger(roomId)) throw ApiError.validation('房间编号不合法')
    const room = ctx.db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as
      | RoomRow
      | undefined
    if (!room) throw ApiError.notFound('房间不存在')

    const body = (req.body ?? {}) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw ApiError.validation('请填写房间编号', 'name')
    const maxWeight = Number(body.maxWeight)
    if (!Number.isFinite(maxWeight) || maxWeight <= 0) {
      throw ApiError.validation('最大体重必须是大于 0 的数字', 'maxWeight')
    }

    const duplicate = ctx.db
      .prepare('SELECT id FROM rooms WHERE name = ? AND id <> ?')
      .get(name, roomId) as { id: number } | undefined
    if (duplicate) throw ApiError.validation('房间编号已存在', 'name')

    if (maxWeight !== room.max_weight) {
      const active = ctx.db
        .prepare(
          `SELECT COUNT(*) AS n FROM reservations
           WHERE room_id = ? AND status IN ('confirmed', 'checked_in')`
        )
        .get(roomId) as { n: number }
      if (Number(active.n) > 0) {
        throw ApiError.conflict('ROOM_IN_USE', '该房间存在未完成预约，不能修改最大体重限制')
      }
    }

    ctx.db
      .prepare('UPDATE rooms SET name = ?, max_weight = ? WHERE id = ?')
      .run(name, maxWeight, roomId)
    const updated = ctx.db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as unknown as RoomRow
    res.json({ room: serializeRoom(updated) })
  })

  return router
}
