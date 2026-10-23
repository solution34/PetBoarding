export type Role = 'owner' | 'staff' | 'admin'
export type Species = 'cat' | 'dog'
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'checked_in'
  | 'missed'
  | 'completed'
export type CareKind = 'feeding' | 'water' | 'cleaning' | 'other'
export type CareStatus = 'pending' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'

export const RESERVATION_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'checked_in',
  'missed',
  'completed'
]
export const CARE_KINDS: CareKind[] = ['feeding', 'water', 'cleaning', 'other']
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer']

export interface Account {
  id: number
  displayName: string
  loginName: string
  roles: Role[]
}

export interface Pet {
  id: number
  ownerId: number
  name: string
  species: Species
  weight: number
  contact: string
  careNotes: string
  vaccineNotes: string
}

export interface RoomType {
  id: number
  name: string
  species: Species
  dailyPriceFen: number
}

export interface Room {
  id: number
  roomTypeId: number
  name: string
  maxWeight: number
}

export interface AccountRow {
  id: number
  display_name: string
  login_name: string
  password_hash: string
  roles: string
}

export interface PetRow {
  id: number
  owner_id: number
  name: string
  species: Species
  weight: number
  contact: string
  care_notes: string
  vaccine_notes: string
}

export interface RoomTypeRow {
  id: number
  name: string
  species: Species
  daily_price_fen: number
}

export interface RoomRow {
  id: number
  room_type_id: number
  name: string
  max_weight: number
}

export interface ReservationRow {
  id: number
  owner_id: number
  pet_id: number
  room_type_id: number
  room_id: number | null
  start_date: string
  end_date: string
  daily_price_snapshot_fen: number
  planned_days: number
  status: ReservationStatus
  reason: string | null
  created_at: string
  reviewed_by: number | null
  reviewed_at: string | null
  updated_at: string
}

export interface StayRow {
  id: number
  reservation_id: number
  check_in_at: string
  check_out_at: string | null
  inspection_notes: string
  late_reason: string | null
  check_in_staff_id: number
}

export interface CareTaskRow {
  id: number
  stay_id: number
  kind: CareKind
  planned_at: string
  instruction: string
  status: CareStatus
  created_at: string
  created_by: number
}

export interface CareRecordRow {
  id: number
  task_id: number
  staff_id: number
  completed_at: string
  notes: string
}

export interface InvoiceRow {
  id: number
  stay_id: number
  planned_days: number
  daily_price_snapshot_fen: number
  base_fee_fen: number
  overdue_days: number
  overdue_fee_fen: number
  total_fen: number
  status: 'paid'
  computed_on: string
  created_at: string
}

export interface ReceiptRow {
  id: number
  invoice_id: number
  amount_fen: number
  method: PaymentMethod
  staff_id: number
  paid_at: string
}
