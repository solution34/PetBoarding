/**
 * API 端点封装，路径与 docs/API.md 第 4 节一一对应。
 */
import { apiRequest } from './client'
import type {
  AccountResponse,
  AdminRoomsResponse,
  AvailabilityQuery,
  AvailabilityResponse,
  BillResponse,
  CandidateRoomsResponse,
  CareTaskResponse,
  CareTasksResponse,
  CheckInPayload,
  CheckInResponse,
  CheckoutPayload,
  CheckoutResponse,
  CompleteCareTaskPayload,
  CreateCareTaskPayload,
  CreateReservationPayload,
  HealthResponse,
  LoginPayload,
  PetPayload,
  PetResponse,
  PetsResponse,
  ReasonPayload,
  ReservationResponse,
  ReservationsResponse,
  ReservationStatus,
  RoomResponse,
  RoomTypeResponse,
  RoomTypesResponse,
  StaysResponse,
  UpdateRoomPayload,
  UpdateRoomTypePayload,
  ApprovePayload,
} from './types'

/* ============ 认证 ============ */

export function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { skipUnauthorizedHandler: true })
}

export function login(payload: LoginPayload): Promise<AccountResponse> {
  return apiRequest<AccountResponse>('/auth/login', {
    method: 'POST',
    body: payload,
    skipUnauthorizedHandler: true,
  })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', skipUnauthorizedHandler: true })
}

export function getMe(): Promise<AccountResponse> {
  return apiRequest<AccountResponse>('/auth/me', { skipUnauthorizedHandler: true })
}

/* ============ 宠物档案 ============ */

export function listPets(): Promise<PetsResponse> {
  return apiRequest<PetsResponse>('/pets')
}

export function createPet(payload: PetPayload): Promise<PetResponse> {
  return apiRequest<PetResponse>('/pets', { method: 'POST', body: payload })
}

export function updatePet(id: number, payload: PetPayload): Promise<PetResponse> {
  return apiRequest<PetResponse>(`/pets/${id}`, { method: 'PUT', body: payload })
}

/* ============ 房型与余量 ============ */

export function listRoomTypes(): Promise<RoomTypesResponse> {
  return apiRequest<RoomTypesResponse>('/room-types')
}

export function getAvailability(query: AvailabilityQuery): Promise<AvailabilityResponse> {
  return apiRequest<AvailabilityResponse>('/availability', { query: { ...query } })
}

/* ============ 预约 ============ */

export function createReservation(
  payload: CreateReservationPayload,
): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>('/reservations', { method: 'POST', body: payload })
}

export function listReservations(status?: ReservationStatus): Promise<ReservationsResponse> {
  return apiRequest<ReservationsResponse>('/reservations', { query: { status } })
}

export function getReservation(id: number): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>(`/reservations/${id}`)
}

export function getCandidateRooms(reservationId: number): Promise<CandidateRoomsResponse> {
  return apiRequest<CandidateRoomsResponse>(`/reservations/${reservationId}/candidate-rooms`)
}

export function getCareTasks(reservationId: number): Promise<CareTasksResponse> {
  return apiRequest<CareTasksResponse>(`/reservations/${reservationId}/care-tasks`)
}

export function getBill(reservationId: number): Promise<BillResponse> {
  return apiRequest<BillResponse>(`/reservations/${reservationId}/bill`)
}

export function approveReservation(
  reservationId: number,
  payload: ApprovePayload,
): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>(`/reservations/${reservationId}/approve`, {
    method: 'POST',
    body: payload,
  })
}

export function rejectReservation(
  reservationId: number,
  payload: ReasonPayload,
): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>(`/reservations/${reservationId}/reject`, {
    method: 'POST',
    body: payload,
  })
}

export function cancelReservation(
  reservationId: number,
  payload: ReasonPayload,
): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>(`/reservations/${reservationId}/cancel`, {
    method: 'POST',
    body: payload,
  })
}

export function markNoShow(
  reservationId: number,
  payload: ReasonPayload,
): Promise<ReservationResponse> {
  return apiRequest<ReservationResponse>(`/reservations/${reservationId}/no-show`, {
    method: 'POST',
    body: payload,
  })
}

/* ============ 入住 / 照护 / 结算 ============ */

export function checkIn(
  reservationId: number,
  payload: CheckInPayload,
): Promise<CheckInResponse> {
  return apiRequest<CheckInResponse>(`/reservations/${reservationId}/check-in`, {
    method: 'POST',
    body: payload,
  })
}

export function createCareTask(
  reservationId: number,
  payload: CreateCareTaskPayload,
): Promise<CareTaskResponse> {
  return apiRequest<CareTaskResponse>(`/reservations/${reservationId}/care-tasks`, {
    method: 'POST',
    body: payload,
  })
}

export function completeCareTask(
  taskId: number,
  payload: CompleteCareTaskPayload,
): Promise<CareTaskResponse> {
  return apiRequest<CareTaskResponse>(`/care-tasks/${taskId}/complete`, {
    method: 'POST',
    body: payload,
  })
}

export function checkout(
  reservationId: number,
  payload: CheckoutPayload,
): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>(`/reservations/${reservationId}/checkout`, {
    method: 'POST',
    body: payload,
  })
}

export function listStays(): Promise<StaysResponse> {
  return apiRequest<StaysResponse>('/stays', { query: { status: 'active' } })
}

/* ============ 管理员维护 ============ */

export function getAdminRooms(): Promise<AdminRoomsResponse> {
  return apiRequest<AdminRoomsResponse>('/admin/rooms')
}

export function updateRoomType(
  roomTypeId: number,
  payload: UpdateRoomTypePayload,
): Promise<RoomTypeResponse> {
  return apiRequest<RoomTypeResponse>(`/admin/room-types/${roomTypeId}`, {
    method: 'PUT',
    body: payload,
  })
}

export function updateRoom(roomId: number, payload: UpdateRoomPayload): Promise<RoomResponse> {
  return apiRequest<RoomResponse>(`/admin/rooms/${roomId}`, { method: 'PUT', body: payload })
}
