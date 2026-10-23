/**
 * 与 docs/API.md（V1.2-demo-1）严格对齐的前端类型定义。
 * 金额单位一律为人民币「分」（...Fen 后缀）；日期为 YYYY-MM-DD；时间戳为 ISO 8601。
 */

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

export type CareTaskKind = 'feeding' | 'water' | 'cleaning' | 'other'
export type CareTaskStatus = 'pending' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'
export type InvoiceStatus = 'paid'

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

/** 审核候选房间（GET /reservations/:id/candidate-rooms）。 */
export interface RoomChoice {
  id: number
  name: string
  maxWeight: number
}

/** 入住记录。预约内嵌的 stay 为精简结构，故 reservationId 可选。 */
export interface Stay {
  id: number
  reservationId?: number
  checkInAt: string
  checkOutAt: string | null
  inspectionNotes: string
  lateReason: string | null
  checkInStaffId: number
}

export interface Reservation {
  id: number
  ownerId: number
  ownerDisplayName: string
  petId: number
  pet: Pet
  roomTypeId: number
  roomType: RoomType
  roomId: number | null
  room: Room | null
  startDate: string
  endDate: string
  plannedDays: number
  /** 提交预约时锁定的日价（分）。 */
  dailyPriceSnapshotFen: number
  /** baseFeeFen = 快照日价 × plannedDays。 */
  baseFeeFen: number
  status: ReservationStatus
  /** 驳回 / 取消 / 失约原因。 */
  reason: string | null
  createdAt: string
  reviewedBy: number | null
  reviewedAt: string | null
  stay: Stay | null
}

export interface CareRecord {
  id: number
  staffId: number
  staffName: string
  completedAt: string
  notes: string
}

export interface CareTask {
  id: number
  reservationId: number
  kind: CareTaskKind
  /** 本地时间 YYYY-MM-DDTHH:mm 或完整 ISO；未带时区按 Asia/Shanghai 解释。 */
  plannedAt: string
  instruction: string
  status: CareTaskStatus
  createdAt: string
  createdBy: number
  createdByName: string
  record: CareRecord | null
}

export interface Receipt {
  id: number
  amountFen: number
  method: PaymentMethod
  staffId: number
  staffName: string
  paidAt: string
}

export interface Invoice {
  id: number
  plannedDays: number
  dailyPriceFen: number
  baseFeeFen: number
  overdueDays: number
  overdueFeeFen: number
  totalFen: number
  status: InvoiceStatus
  computedOn: string
  createdAt: string
}

export interface Bill {
  reservationId: number
  plannedDays: number
  dailyPriceFen: number
  baseFeeFen: number
  overdueDays: number
  overdueFeeFen: number
  totalFen: number
  /** 计算所依据的“今天”。 */
  computedOn: string
  actualCheckInDate: string | null
  actualCheckOutDate: string | null
  settled: boolean
  invoice: Invoice | null
  receipt: Receipt | null
}

export interface StaySummary {
  id: number
  reservationId: number
  checkInAt: string
  checkOutAt: string | null
  inspectionNotes: string
  lateReason: string | null
  reservation: Reservation
  pendingTaskCount: number
  completedTaskCount: number
}

export interface AvailabilityItem {
  roomTypeId: number
  name: string
  species: Species
  dailyPriceFen: number
  plannedDays: number
  /** 日价 × plannedDays（计划基础费，仅展示）。 */
  totalFen: number
  /** 同一间房覆盖整个区间的房间数。 */
  availableRooms: number
}

export interface AvailabilityResponse {
  startDate: string
  endDate: string
  plannedDays: number
  items: AvailabilityItem[]
}

export interface AdminRoom extends Room {
  activeReservationCount: number
}

export interface AdminRoomType extends RoomType {
  rooms: AdminRoom[]
}

export interface HealthResponse {
  today: string
  clockOverridden?: boolean
}

/* ============ 请求 / 响应载荷 ============ */

export interface AccountResponse {
  account: Account
}

export interface LoginPayload {
  loginName: string
  password: string
}

export interface PetPayload {
  name: string
  species: Species
  weight: number
  contact: string
  careNotes: string
  vaccineNotes: string
}

export interface AvailabilityQuery {
  petId: number
  startDate: string
  endDate: string
}

export interface CreateReservationPayload {
  petId: number
  roomTypeId: number
  startDate: string
  endDate: string
  /** 页面已确认的日价（分）；与服务器不一致时返回 409 PRICE_CHANGED。 */
  confirmedDailyPriceFen: number
}

/** 409 PRICE_CHANGED 响应 details。 */
export interface PriceChangedDetails {
  dailyPriceFen: number
  plannedDays: number
  totalFen: number
}

export interface ApprovePayload {
  roomId: number
}

export interface ReasonPayload {
  reason: string
}

export interface CheckInPayload {
  inspectionPassed: boolean
  inspectionNotes: string
  /** 今天晚于 startDate 时必填。 */
  lateReason?: string
}

export interface CheckInResponse {
  reservation: Reservation
  stay: Stay
}

export interface CreateCareTaskPayload {
  kind: CareTaskKind
  /** YYYY-MM-DDTHH:mm（Asia/Shanghai）或完整 ISO。 */
  plannedAt: string
  instruction: string
}

export interface CompleteCareTaskPayload {
  notes: string
}

export interface CheckoutPayload {
  paymentMethod: PaymentMethod
  ownerConfirmed: boolean
}

export interface CheckoutResponse {
  bill: Bill
  reservation: Reservation
}

export interface UpdateRoomTypePayload {
  dailyPriceFen: number
}

export interface UpdateRoomPayload {
  name: string
  maxWeight: number
}

export interface PetsResponse {
  pets: Pet[]
}

export interface PetResponse {
  pet: Pet
}

export interface RoomTypesResponse {
  roomTypes: RoomType[]
}

export interface RoomTypeResponse {
  roomType: RoomType
}

export interface RoomResponse {
  room: Room
}

export interface ReservationsResponse {
  reservations: Reservation[]
}

export interface ReservationResponse {
  reservation: Reservation
}

export interface CandidateRoomsResponse {
  rooms: RoomChoice[]
}

export interface CareTasksResponse {
  tasks: CareTask[]
}

export interface CareTaskResponse {
  task: CareTask
}

export interface BillResponse {
  bill: Bill
}

export interface StaysResponse {
  stays: StaySummary[]
}

export interface AdminRoomsResponse {
  roomTypes: AdminRoomType[]
}
