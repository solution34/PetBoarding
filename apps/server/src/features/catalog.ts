import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import { dayDiff, isDateString } from '../lib/dates.js'
import { serializeRoomType } from '../serialize.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import type { PetRow, RoomTypeRow } from '../types.js'

export function createCatalogRouter(ctx: AppContext): Router {
  const router = Router()

  router.get('/room-types', requireAuth, (_req, res) => {
    const rows = ctx.db
      .prepare('SELECT * FROM room_types ORDER BY id')
      .all() as unknown as RoomTypeRow[]
    res.json({ roomTypes: rows.map(serializeRoomType) })
  })

  router.get('/availability', requireAuth, requireRole('owner'), (req, res) => {
    const petId = Number(req.query.petId)
    if (!Number.isInteger(petId)) throw ApiError.validation('请选择宠物', 'petId')

    const pet = ctx.db.prepare('SELECT * FROM pets WHERE id = ?').get(petId) as PetRow | undefined
    if (!pet) throw ApiError.notFound('宠物不存在')
    if (pet.owner_id !== req.account!.id) throw ApiError.forbidden('只能查询本人宠物的房型')

    const startDate = req.query.startDate
    const endDate = req.query.endDate
    if (!isDateString(startDate)) throw ApiError.validation('请选择有效的开始日期', 'startDate')
    if (!isDateString(endDate)) throw ApiError.validation('请选择有效的离店日期', 'endDate')
    const today = ctx.today()
    if (startDate < today) throw ApiError.validation('开始日期不能早于今天', 'startDate')
    if (startDate >= endDate) throw ApiError.validation('离店日期必须晚于开始日期', 'endDate')
    const plannedDays = dayDiff(startDate, endDate)

    const plannedRows = ctx.db
      .prepare(
        `SELECT DISTINCT room_id FROM reservations
         WHERE room_id IS NOT NULL
           AND status IN ('confirmed', 'checked_in')
           AND start_date < ? AND ? < end_date`
      )
      .all(endDate, startDate) as unknown as Array<{ room_id: number }>
    const actualRows = ctx.db
      .prepare(
        `SELECT DISTINCT r.room_id FROM stays s
         JOIN reservations r ON r.id = s.reservation_id
         WHERE s.check_out_at IS NULL AND r.room_id IS NOT NULL`
      )
      .all() as unknown as Array<{ room_id: number }>

    const blocked = new Set<number>()
    for (const row of plannedRows) blocked.add(row.room_id)
    for (const row of actualRows) blocked.add(row.room_id)

    const roomTypes = ctx.db
      .prepare('SELECT * FROM room_types WHERE species = ? ORDER BY id')
      .all(pet.species) as unknown as RoomTypeRow[]

    const items: Array<{
      roomTypeId: number
      name: string
      species: 'cat' | 'dog'
      dailyPriceFen: number
      plannedDays: number
      totalFen: number
      availableRooms: number
    }> = []
    for (const roomType of roomTypes) {
      const rooms = ctx.db
        .prepare('SELECT id FROM rooms WHERE room_type_id = ? AND max_weight >= ?')
        .all(roomType.id, pet.weight) as unknown as Array<{ id: number }>
      // 无满足体重的房间时不作为匹配房型展示；有匹配房间但被占用则显示 0。
      if (rooms.length === 0) continue
      const availableRooms = rooms.filter((room) => !blocked.has(room.id)).length
      items.push({
        roomTypeId: roomType.id,
        name: roomType.name,
        species: roomType.species,
        dailyPriceFen: roomType.daily_price_fen,
        plannedDays,
        totalFen: roomType.daily_price_fen * plannedDays,
        availableRooms
      })
    }

    res.json({ startDate, endDate, plannedDays, items })
  })

  return router
}
