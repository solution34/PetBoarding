import type { DatabaseSync } from 'node:sqlite'
import type {
  CareTaskRow,
  PetRow,
  ReservationRow,
  RoomRow,
  RoomTypeRow,
  StayRow
} from './types.js'

export function serializePet(row: PetRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    species: row.species,
    weight: row.weight,
    contact: row.contact,
    careNotes: row.care_notes,
    vaccineNotes: row.vaccine_notes
  }
}

export function serializeRoomType(row: RoomTypeRow) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    dailyPriceFen: row.daily_price_fen
  }
}

export function serializeRoom(row: RoomRow) {
  return {
    id: row.id,
    roomTypeId: row.room_type_id,
    name: row.name,
    maxWeight: row.max_weight
  }
}

export function getStayByReservationId(db: DatabaseSync, reservationId: number): StayRow | null {
  const row = db.prepare('SELECT * FROM stays WHERE reservation_id = ?').get(reservationId) as
    | StayRow
    | undefined
  return row ?? null
}

export function serializeStay(row: StayRow) {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    inspectionNotes: row.inspection_notes,
    lateReason: row.late_reason,
    checkInStaffId: row.check_in_staff_id
  }
}

export function serializeReservation(db: DatabaseSync, row: ReservationRow) {
  const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(row.pet_id) as PetRow | undefined
  const roomType = db.prepare('SELECT * FROM room_types WHERE id = ?').get(row.room_type_id) as
    | RoomTypeRow
    | undefined
  const room = row.room_id
    ? ((db.prepare('SELECT * FROM rooms WHERE id = ?').get(row.room_id) as RoomRow | undefined) ?? null)
    : null
  const owner = db.prepare('SELECT display_name FROM accounts WHERE id = ?').get(row.owner_id) as
    | { display_name: string }
    | undefined
  const stay = getStayByReservationId(db, row.id)

  if (!pet || !roomType) {
    throw new Error(`预约 ${row.id} 关联的宠物或房型数据缺失`)
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerDisplayName: owner?.display_name ?? '',
    petId: row.pet_id,
    pet: serializePet(pet),
    roomTypeId: row.room_type_id,
    roomType: serializeRoomType(roomType),
    roomId: row.room_id,
    room: room ? serializeRoom(room) : null,
    startDate: row.start_date,
    endDate: row.end_date,
    plannedDays: row.planned_days,
    dailyPriceSnapshotFen: row.daily_price_snapshot_fen,
    baseFeeFen: row.daily_price_snapshot_fen * row.planned_days,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    stay: stay ? serializeStay(stay) : null
  }
}

export function serializeCareTask(db: DatabaseSync, row: CareTaskRow) {
  const stay = db.prepare('SELECT * FROM stays WHERE id = ?').get(row.stay_id) as StayRow | undefined
  const creator = db.prepare('SELECT display_name FROM accounts WHERE id = ?').get(row.created_by) as
    | { display_name: string }
    | undefined
  const record = db
    .prepare(
      `SELECT r.*, a.display_name AS staff_name
       FROM care_records r JOIN accounts a ON a.id = r.staff_id
       WHERE r.task_id = ?`
    )
    .get(row.id) as
    | {
        id: number
        task_id: number
        staff_id: number
        completed_at: string
        notes: string
        staff_name: string
      }
    | undefined

  return {
    id: row.id,
    reservationId: stay?.reservation_id ?? 0,
    kind: row.kind,
    plannedAt: row.planned_at,
    instruction: row.instruction,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: creator?.display_name ?? '',
    record: record
      ? {
          id: record.id,
          staffId: record.staff_id,
          staffName: record.staff_name,
          completedAt: record.completed_at,
          notes: record.notes
        }
      : null
  }
}

export function serializeStaySummary(db: DatabaseSync, row: StayRow) {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(row.reservation_id) as
    | ReservationRow
    | undefined
  if (!reservation) {
    throw new Error(`入住记录 ${row.id} 关联的预约缺失`)
  }
  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
       FROM care_tasks WHERE stay_id = ?`
    )
    .get(row.id) as { pending_count: number | null; completed_count: number | null }

  return {
    id: row.id,
    reservationId: row.reservation_id,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    inspectionNotes: row.inspection_notes,
    lateReason: row.late_reason,
    pendingTaskCount: Number(counts?.pending_count ?? 0),
    completedTaskCount: Number(counts?.completed_count ?? 0),
    reservation: serializeReservation(db, reservation)
  }
}
