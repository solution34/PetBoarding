import { Router } from 'express'
import type { AppContext } from '../context.js'
import { ApiError } from '../lib/errors.js'
import {
  dayDiff,
  endOfBusinessDate,
  isDateString,
  nowIso,
  parseLocalDateTime,
  shanghaiDateOf
} from '../lib/dates.js'
import { withTransaction } from '../db/index.js'
import {
  getStayByReservationId,
  serializeCareTask,
  serializeReservation,
  serializeStay
} from '../serialize.js'
import {
  assertOwnerAccess,
  requireAuth,
  requireOwnerOrStaff,
  requireRole
} from '../middleware/auth.js'
import { CARE_KINDS, RESERVATION_STATUSES } from '../types.js'
import type {
  CareKind,
  CareTaskRow,
  InvoiceRow,
  PaymentMethod,
  PetRow,
  ReceiptRow,
  ReservationRow,
  ReservationStatus,
  RoomRow,
  RoomTypeRow,
  StayRow
} from '../types.js'

function parseId(value: unknown, field = 'id'): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw ApiError.validation('编号不合法', field)
  return id
}

function getReservationOrThrow(ctx: AppContext, id: number): ReservationRow {
  const row = ctx.db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as
    | ReservationRow
    | undefined
  if (!row) throw ApiError.notFound('预约不存在')
  return row
}

function getPetOrThrow(ctx: AppContext, id: number): PetRow {
  const row = ctx.db.prepare('SELECT * FROM pets WHERE id = ?').get(id) as PetRow | undefined
  if (!row) throw ApiError.notFound('宠物不存在')
  return row
}

function getRoomTypeOrThrow(ctx: AppContext, id: number): RoomTypeRow {
  const row = ctx.db.prepare('SELECT * FROM room_types WHERE id = ?').get(id) as
    | RoomTypeRow
    | undefined
  if (!row) throw ApiError.notFound('房型不存在')
  return row
}

function validateReservationDates(
  today: string,
  startInput: unknown,
  endInput: unknown
): { startDate: string; endDate: string; plannedDays: number } {
  if (!isDateString(startInput)) throw ApiError.validation('请选择有效的开始日期', 'startDate')
  if (!isDateString(endInput)) throw ApiError.validation('请选择有效的离店日期', 'endDate')
  if (startInput < today) throw ApiError.validation('开始日期不能早于今天', 'startDate')
  if (startInput >= endInput) throw ApiError.validation('离店日期必须晚于开始日期', 'endDate')
  return { startDate: startInput, endDate: endInput, plannedDays: dayDiff(startInput, endInput) }
}

/** 房间在 [startDate, endDate) 内是否可连续使用；同时排除当前实际占用。 */
function roomIsFree(
  ctx: AppContext,
  roomId: number,
  startDate: string,
  endDate: string,
  excludeReservationId: number | null
): boolean {
  const planned =
    excludeReservationId === null
      ? (ctx.db
          .prepare(
            `SELECT id FROM reservations
             WHERE room_id = ? AND status IN ('confirmed', 'checked_in')
               AND start_date < ? AND ? < end_date LIMIT 1`
          )
          .get(roomId, endDate, startDate) as { id: number } | undefined)
      : (ctx.db
          .prepare(
            `SELECT id FROM reservations
             WHERE room_id = ? AND id <> ? AND status IN ('confirmed', 'checked_in')
               AND start_date < ? AND ? < end_date LIMIT 1`
          )
          .get(roomId, excludeReservationId, endDate, startDate) as
          | { id: number }
          | undefined)
  if (planned) return false

  const active = ctx.db
    .prepare(
      `SELECT s.id FROM stays s
       JOIN reservations r ON r.id = s.reservation_id
       WHERE r.room_id = ? AND s.check_out_at IS NULL LIMIT 1`
    )
    .get(roomId) as { id: number } | undefined
  return !active
}

export function createReservationsRouter(ctx: AppContext): Router {
  const router = Router()

  // 提交预约（锁价）
  router.post('/', requireAuth, requireRole('owner'), (req, res) => {
    const account = req.account!
    const body = (req.body ?? {}) as Record<string, unknown>
    const petId = parseId(body.petId, 'petId')
    const roomTypeId = parseId(body.roomTypeId, 'roomTypeId')
    const { startDate, endDate, plannedDays } = validateReservationDates(
      ctx.today(),
      body.startDate,
      body.endDate
    )

    const pet = getPetOrThrow(ctx, petId)
    if (pet.owner_id !== account.id) throw ApiError.forbidden('只能为本人宠物预约')
    const roomType = getRoomTypeOrThrow(ctx, roomTypeId)
    if (roomType.species !== pet.species) {
      throw ApiError.validation('房型与宠物物种不匹配', 'roomTypeId')
    }
    const fitRoom = ctx.db
      .prepare('SELECT id FROM rooms WHERE room_type_id = ? AND max_weight >= ? LIMIT 1')
      .get(roomTypeId, pet.weight) as { id: number } | undefined
    if (!fitRoom) throw ApiError.validation('该房型没有适合此宠物体重的房间', 'roomTypeId')

    const petOverlap = ctx.db
      .prepare(
        `SELECT id FROM reservations
         WHERE pet_id = ? AND status IN ('confirmed', 'checked_in')
           AND start_date < ? AND ? < end_date LIMIT 1`
      )
      .get(petId, endDate, startDate) as { id: number } | undefined
    if (petOverlap) {
      throw ApiError.conflict('PET_OVERLAP', '该宠物在所选日期已有已确认或已入住的预约')
    }

    const currentPrice = roomType.daily_price_fen
    const confirmedPrice = Number(body.confirmedDailyPriceFen)
    if (!Number.isInteger(confirmedPrice) || confirmedPrice < 0) {
      throw ApiError.validation('请先确认当前房型价格', 'confirmedDailyPriceFen')
    }
    if (confirmedPrice !== currentPrice) {
      throw ApiError.conflict('PRICE_CHANGED', '房型价格已变化，请确认新价格后重新提交', {
        dailyPriceFen: currentPrice,
        plannedDays,
        totalFen: currentPrice * plannedDays
      })
    }

    const createdAt = nowIso()
    const info = ctx.db
      .prepare(
        `INSERT INTO reservations
          (owner_id, pet_id, room_type_id, room_id, start_date, end_date,
           daily_price_snapshot_fen, planned_days, status, reason, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
      )
      .run(
        account.id,
        petId,
        roomTypeId,
        startDate,
        endDate,
        currentPrice,
        plannedDays,
        createdAt,
        createdAt
      )
    const row = getReservationOrThrow(ctx, Number(info.lastInsertRowid))
    res.status(201).json({ reservation: serializeReservation(ctx.db, row) })
  })

  // 预约列表
  router.get('/', requireAuth, requireOwnerOrStaff, (req, res) => {
    const account = req.account!
    const status = req.query.status
    if (status !== undefined && !RESERVATION_STATUSES.includes(status as ReservationStatus)) {
      throw ApiError.validation('预约状态筛选值不合法', 'status')
    }
    const conditions: string[] = []
    const params: Array<string | number> = []
    if (!account.roles.includes('staff')) {
      conditions.push('owner_id = ?')
      params.push(account.id)
    }
    if (status !== undefined) {
      conditions.push('status = ?')
      params.push(status as string)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = ctx.db
      .prepare(`SELECT * FROM reservations ${where} ORDER BY id DESC`)
      .all(...params) as unknown as ReservationRow[]
    res.json({ reservations: rows.map((row) => serializeReservation(ctx.db, row)) })
  })

  // 预约详情
  router.get('/:id', requireAuth, requireOwnerOrStaff, (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    assertOwnerAccess(req.account!, row.owner_id)
    res.json({ reservation: serializeReservation(ctx.db, row) })
  })

  // 取消预约
  router.post('/:id/cancel', requireAuth, requireOwnerOrStaff, (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    assertOwnerAccess(req.account!, row.owner_id)
    if (row.status !== 'pending' && row.status !== 'confirmed') {
      throw ApiError.invalidState('只有待审核或已确认的预约可以取消')
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) throw ApiError.validation('请填写取消原因', 'reason')

    ctx.db
      .prepare(`UPDATE reservations SET status = 'cancelled', reason = ?, updated_at = ? WHERE id = ?`)
      .run(reason, nowIso(), row.id)
    const updated = getReservationOrThrow(ctx, row.id)
    res.json({ reservation: serializeReservation(ctx.db, updated) })
  })

  // 审核候选房间
  router.get('/:id/candidate-rooms', requireAuth, requireRole('staff'), (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    if (row.status !== 'pending') throw ApiError.invalidState('只有待审核预约需要选择房间')
    const pet = getPetOrThrow(ctx, row.pet_id)
    const rooms = ctx.db
      .prepare('SELECT * FROM rooms WHERE room_type_id = ? AND max_weight >= ? ORDER BY name')
      .all(row.room_type_id, pet.weight) as unknown as RoomRow[]
    const available = rooms.filter((room) =>
      roomIsFree(ctx, room.id, row.start_date, row.end_date, null)
    )
    res.json({
      rooms: available.map((room) => ({ id: room.id, name: room.name, maxWeight: room.max_weight }))
    })
  })

  // 审核通过并分房
  router.post('/:id/approve', requireAuth, requireRole('staff'), (req, res) => {
    const id = parseId(req.params.id)
    const updated = withTransaction(ctx.db, () => {
      const row = getReservationOrThrow(ctx, id)
      if (row.status !== 'pending') throw ApiError.invalidState('只有待审核预约可以审核')
      const body = (req.body ?? {}) as Record<string, unknown>
      const roomId = parseId(body.roomId, 'roomId')
      const room = ctx.db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as
        | RoomRow
        | undefined
      if (!room) throw ApiError.notFound('房间不存在')
      if (room.room_type_id !== row.room_type_id) {
        throw ApiError.conflict('ROOM_UNAVAILABLE', '所选房间不属于该预约的房型')
      }
      const pet = getPetOrThrow(ctx, row.pet_id)
      if (pet.weight > room.max_weight) {
        throw ApiError.conflict('ROOM_UNAVAILABLE', '房间最大体重限制不满足该宠物')
      }
      if (!roomIsFree(ctx, room.id, row.start_date, row.end_date, row.id)) {
        throw ApiError.conflict('ROOM_UNAVAILABLE', '该房间在预约区间内不可用')
      }
      const reviewedAt = nowIso()
      ctx.db
        .prepare(
          `UPDATE reservations
           SET room_id = ?, status = 'confirmed', reviewed_by = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(room.id, req.account!.id, reviewedAt, reviewedAt, row.id)
      return getReservationOrThrow(ctx, row.id)
    })
    res.json({ reservation: serializeReservation(ctx.db, updated) })
  })

  // 驳回预约
  router.post('/:id/reject', requireAuth, requireRole('staff'), (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    if (row.status !== 'pending') throw ApiError.invalidState('只有待审核预约可以驳回')
    const body = (req.body ?? {}) as Record<string, unknown>
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) throw ApiError.validation('请填写驳回原因', 'reason')

    const reviewedAt = nowIso()
    ctx.db
      .prepare(
        `UPDATE reservations
         SET status = 'rejected', reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(reason, req.account!.id, reviewedAt, reviewedAt, row.id)
    const updated = getReservationOrThrow(ctx, row.id)
    res.json({ reservation: serializeReservation(ctx.db, updated) })
  })

  // 手动标记失约
  router.post('/:id/no-show', requireAuth, requireRole('staff'), (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    if (row.status !== 'confirmed') throw ApiError.invalidState('只有已确认预约可以标记失约')
    if (ctx.today() < row.end_date) {
      throw ApiError.invalidState('到达计划离店日之后才能标记失约')
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) throw ApiError.validation('请填写失约原因', 'reason')

    const reviewedAt = nowIso()
    ctx.db
      .prepare(
        `UPDATE reservations
         SET status = 'missed', reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(reason, req.account!.id, reviewedAt, reviewedAt, row.id)
    const updated = getReservationOrThrow(ctx, row.id)
    res.json({ reservation: serializeReservation(ctx.db, updated) })
  })

  // 办理入住
  router.post('/:id/check-in', requireAuth, requireRole('staff'), (req, res) => {
    const id = parseId(req.params.id)
    const body = (req.body ?? {}) as Record<string, unknown>
    const result = withTransaction(ctx.db, () => {
      const row = getReservationOrThrow(ctx, id)
      if (row.status !== 'confirmed') throw ApiError.invalidState('只有已确认预约可以办理入住')
      const today = ctx.today()
      if (today < row.start_date || today >= row.end_date) {
        throw new ApiError(
          400,
          'CHECKIN_DATE_INVALID',
          '当前日期不在可办理入住的区间内（开始日至计划离店日前一日）'
        )
      }
      if (body.inspectionPassed !== true) {
        throw ApiError.validation('入住检查未通过，不能办理入住')
      }
      const lateReason = typeof body.lateReason === 'string' ? body.lateReason.trim() : ''
      if (today > row.start_date && !lateReason) {
        throw new ApiError(400, 'LATE_REASON_REQUIRED', '延迟入住必须填写原因')
      }
      if (!row.room_id) {
        throw ApiError.conflict('ROOM_UNAVAILABLE', '该预约尚未分配房间')
      }
      if (!roomIsFree(ctx, row.room_id, row.start_date, row.end_date, row.id)) {
        throw ApiError.conflict('ROOM_UNAVAILABLE', '房间当前被占用或存在冲突，无法办理入住')
      }
      const inspectionNotes =
        typeof body.inspectionNotes === 'string' ? body.inspectionNotes.trim() : ''
      const checkInAt = nowIso()
      const stayInfo = ctx.db
        .prepare(
          `INSERT INTO stays
            (reservation_id, check_in_at, check_out_at, inspection_notes, late_reason, check_in_staff_id)
           VALUES (?, ?, NULL, ?, ?, ?)`
        )
        .run(row.id, checkInAt, inspectionNotes, lateReason || null, req.account!.id)
      ctx.db
        .prepare(`UPDATE reservations SET status = 'checked_in', updated_at = ? WHERE id = ?`)
        .run(checkInAt, row.id)
      const stay = ctx.db
        .prepare('SELECT * FROM stays WHERE id = ?')
        .get(Number(stayInfo.lastInsertRowid)) as unknown as StayRow
      return { reservation: getReservationOrThrow(ctx, row.id), stay }
    })
    res.json({
      reservation: serializeReservation(ctx.db, result.reservation),
      stay: serializeStay(result.stay)
    })
  })

  // 照护任务列表
  router.get('/:id/care-tasks', requireAuth, requireOwnerOrStaff, (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    assertOwnerAccess(req.account!, row.owner_id)
    const stay = getStayByReservationId(ctx.db, row.id)
    if (!stay) {
      res.json({ tasks: [] })
      return
    }
    const tasks = ctx.db
      .prepare('SELECT * FROM care_tasks WHERE stay_id = ? ORDER BY planned_at, id')
      .all(stay.id) as unknown as CareTaskRow[]
    res.json({ tasks: tasks.map((task) => serializeCareTask(ctx.db, task)) })
  })

  // 创建照护任务
  router.post('/:id/care-tasks', requireAuth, requireRole('staff'), (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    if (row.status !== 'checked_in') throw ApiError.invalidState('只有在住预约可以安排照护任务')
    const stay = getStayByReservationId(ctx.db, row.id)
    if (!stay || stay.check_out_at) throw ApiError.invalidState('宠物已离店，不能安排照护任务')

    const body = (req.body ?? {}) as Record<string, unknown>
    const kindInput = body.kind
    if (typeof kindInput !== 'string' || !CARE_KINDS.includes(kindInput as CareKind)) {
      throw ApiError.validation('请选择照护类型', 'kind')
    }
    const kind = kindInput as CareKind
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : ''
    if (!instruction) throw ApiError.validation('请填写照护说明', 'instruction')
    const planned = parseLocalDateTime(body.plannedAt)
    if (!planned) throw ApiError.validation('请填写有效的计划时间', 'plannedAt')
    if (planned.getTime() <= Date.parse(stay.check_in_at)) {
      throw ApiError.validation('照护任务计划时间必须晚于实际入住时间', 'plannedAt')
    }
    if (planned.getTime() > endOfBusinessDate(row.end_date).getTime()) {
      throw ApiError.validation('照护任务计划时间不能晚于计划离店日', 'plannedAt')
    }

    const createdAt = nowIso()
    const info = ctx.db
      .prepare(
        `INSERT INTO care_tasks (stay_id, kind, planned_at, instruction, status, created_at, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(stay.id, kind, planned.toISOString(), instruction, createdAt, req.account!.id)
    const task = ctx.db
      .prepare('SELECT * FROM care_tasks WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as CareTaskRow
    res.status(201).json({ task: serializeCareTask(ctx.db, task) })
  })

  // 账单（在住预览 / 已结单结果）
  router.get('/:id/bill', requireAuth, requireOwnerOrStaff, (req, res) => {
    const row = getReservationOrThrow(ctx, parseId(req.params.id))
    assertOwnerAccess(req.account!, row.owner_id)
    if (row.status !== 'checked_in' && row.status !== 'completed') {
      throw ApiError.validation('该预约尚未入住，暂无账单')
    }
    const stay = getStayByReservationId(ctx.db, row.id)
    if (!stay) throw ApiError.notFound('入住记录不存在')
    res.json({ bill: buildBill(ctx, row, stay) })
  })

  // 离店结算（登记线下全额收款）
  router.post('/:id/checkout', requireAuth, requireRole('staff'), (req, res) => {
    const id = parseId(req.params.id)
    withTransaction(ctx.db, () => {
      const row = getReservationOrThrow(ctx, id)
      if (row.status !== 'checked_in') throw ApiError.invalidState('只有已入住预约可以办理离店结算')
      const stay = getStayByReservationId(ctx.db, row.id)
      if (!stay || stay.check_out_at) throw ApiError.invalidState('该入住已结束')

      const body = (req.body ?? {}) as Record<string, unknown>
      if (body.ownerConfirmed !== true) {
        throw new ApiError(400, 'PAYMENT_INVALID', '请先由主人核对账单并确认全额收款')
      }
      const methodInput = body.paymentMethod
      if (methodInput !== 'cash' && methodInput !== 'transfer') {
        throw new ApiError(400, 'PAYMENT_INVALID', '收款方式只能是现金或线下转账')
      }
      const method: PaymentMethod = methodInput === 'cash' ? 'cash' : 'transfer'

      const today = ctx.today()
      const checkInDate = shanghaiDateOf(stay.check_in_at)
      if (today < checkInDate) throw ApiError.validation('实际离店日期不能早于入住日期')
      const overdueDays = Math.max(0, dayDiff(row.end_date, today))
      const baseFeeFen = row.daily_price_snapshot_fen * row.planned_days
      const overdueFeeFen = overdueDays * row.daily_price_snapshot_fen
      const totalFen = baseFeeFen + overdueFeeFen
      const settledAt = nowIso()

      const invoiceInfo = ctx.db
        .prepare(
          `INSERT INTO invoices
            (stay_id, planned_days, daily_price_snapshot_fen, base_fee_fen,
             overdue_days, overdue_fee_fen, total_fen, status, computed_on, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`
        )
        .run(
          stay.id,
          row.planned_days,
          row.daily_price_snapshot_fen,
          baseFeeFen,
          overdueDays,
          overdueFeeFen,
          totalFen,
          today,
          settledAt
        )
      ctx.db
        .prepare(
          `INSERT INTO receipts (invoice_id, amount_fen, method, staff_id, paid_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(Number(invoiceInfo.lastInsertRowid), totalFen, method, req.account!.id, settledAt)
      ctx.db.prepare('UPDATE stays SET check_out_at = ? WHERE id = ?').run(settledAt, stay.id)
      ctx.db
        .prepare(`UPDATE reservations SET status = 'completed', updated_at = ? WHERE id = ?`)
        .run(settledAt, row.id)
      ctx.db
        .prepare(`UPDATE care_tasks SET status = 'cancelled' WHERE stay_id = ? AND status = 'pending'`)
        .run(stay.id)
    })

    const row = getReservationOrThrow(ctx, id)
    const stay = getStayByReservationId(ctx.db, id)!
    res.json({ bill: buildBill(ctx, row, stay), reservation: serializeReservation(ctx.db, row) })
  })

  return router
}

interface BillPayload {
  reservationId: number
  plannedDays: number
  dailyPriceFen: number
  baseFeeFen: number
  overdueDays: number
  overdueFeeFen: number
  totalFen: number
  computedOn: string
  actualCheckInDate: string | null
  actualCheckOutDate: string | null
  settled: boolean
  invoice: null | {
    id: number
    plannedDays: number
    dailyPriceFen: number
    baseFeeFen: number
    overdueDays: number
    overdueFeeFen: number
    totalFen: number
    status: 'paid'
    computedOn: string
    createdAt: string
  }
  receipt: null | {
    id: number
    amountFen: number
    method: PaymentMethod
    staffId: number
    staffName: string
    paidAt: string
  }
}

export function buildBill(ctx: AppContext, row: ReservationRow, stay: StayRow): BillPayload {
  const invoice = ctx.db.prepare('SELECT * FROM invoices WHERE stay_id = ?').get(stay.id) as
    | InvoiceRow
    | undefined

  if (row.status === 'completed' && invoice) {
    const receipt = ctx.db
      .prepare(
        `SELECT r.*, a.display_name AS staff_name FROM receipts r
         JOIN accounts a ON a.id = r.staff_id WHERE r.invoice_id = ?`
      )
      .get(invoice.id) as (ReceiptRow & { staff_name: string }) | undefined
    return {
      reservationId: row.id,
      plannedDays: invoice.planned_days,
      dailyPriceFen: invoice.daily_price_snapshot_fen,
      baseFeeFen: invoice.base_fee_fen,
      overdueDays: invoice.overdue_days,
      overdueFeeFen: invoice.overdue_fee_fen,
      totalFen: invoice.total_fen,
      computedOn: invoice.computed_on,
      actualCheckInDate: shanghaiDateOf(stay.check_in_at),
      actualCheckOutDate: stay.check_out_at ? shanghaiDateOf(stay.check_out_at) : null,
      settled: true,
      invoice: {
        id: invoice.id,
        plannedDays: invoice.planned_days,
        dailyPriceFen: invoice.daily_price_snapshot_fen,
        baseFeeFen: invoice.base_fee_fen,
        overdueDays: invoice.overdue_days,
        overdueFeeFen: invoice.overdue_fee_fen,
        totalFen: invoice.total_fen,
        status: 'paid',
        computedOn: invoice.computed_on,
        createdAt: invoice.created_at
      },
      receipt: receipt
        ? {
            id: receipt.id,
            amountFen: receipt.amount_fen,
            method: receipt.method,
            staffId: receipt.staff_id,
            staffName: receipt.staff_name,
            paidAt: receipt.paid_at
          }
        : null
    }
  }

  const today = ctx.today()
  const overdueDays = Math.max(0, dayDiff(row.end_date, today))
  const baseFeeFen = row.daily_price_snapshot_fen * row.planned_days
  const overdueFeeFen = overdueDays * row.daily_price_snapshot_fen
  return {
    reservationId: row.id,
    plannedDays: row.planned_days,
    dailyPriceFen: row.daily_price_snapshot_fen,
    baseFeeFen,
    overdueDays,
    overdueFeeFen,
    totalFen: baseFeeFen + overdueFeeFen,
    computedOn: today,
    actualCheckInDate: shanghaiDateOf(stay.check_in_at),
    actualCheckOutDate: null,
    settled: false,
    invoice: null,
    receipt: null
  }
}
