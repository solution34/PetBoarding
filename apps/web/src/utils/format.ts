/**
 * 展示格式化：金额（分 → 元）、枚举中文文案与状态徽章色调。
 */
import type {
  CareTaskKind,
  CareTaskStatus,
  PaymentMethod,
  ReservationStatus,
  Role,
  Species,
} from '../api/types'

export type StatusTone = 'amber' | 'blue' | 'green' | 'red' | 'gray' | 'purple'

/** 分 → 「¥80.00」。 */
export function formatFen(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`
}

/** 分 → 元输入框文本（两位小数）。 */
export function fenToYuanInput(fen: number): string {
  return (fen / 100).toFixed(2)
}

/** 元输入文本 → 分；非法或负数返回 null。 */
export function yuanInputToFen(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const number = Number(text)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 100)
}

export function formatWeight(weight: number): string {
  return `${weight} kg`
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: '宠物主人',
  staff: '工作人员',
  admin: '管理员',
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role
}

export const SPECIES_LABELS: Record<Species, string> = {
  cat: '猫',
  dog: '犬',
}

export function speciesLabel(species: Species): string {
  return SPECIES_LABELS[species] ?? species
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: '待审核',
  confirmed: '已确认',
  rejected: '已驳回',
  cancelled: '已取消',
  checked_in: '已入住',
  missed: '已失约',
  completed: '已完成',
}

export function reservationStatusLabel(status: ReservationStatus): string {
  return RESERVATION_STATUS_LABELS[status] ?? status
}

export const CARE_TASK_STATUS_LABELS: Record<CareTaskStatus, string> = {
  pending: '待完成',
  completed: '已完成',
  cancelled: '已取消',
}

export const CARE_TASK_KIND_LABELS: Record<CareTaskKind, string> = {
  feeding: '喂食',
  water: '饮水',
  cleaning: '清洁',
  other: '其他',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '现金',
  transfer: '线下转账',
}

export function reservationTone(status: ReservationStatus): StatusTone {
  switch (status) {
    case 'pending':
      return 'amber'
    case 'confirmed':
      return 'blue'
    case 'checked_in':
      return 'green'
    case 'completed':
      return 'purple'
    case 'rejected':
    case 'missed':
      return 'red'
    case 'cancelled':
    default:
      return 'gray'
  }
}

export function careTaskTone(status: CareTaskStatus): StatusTone {
  switch (status) {
    case 'pending':
      return 'amber'
    case 'completed':
      return 'green'
    case 'cancelled':
    default:
      return 'gray'
  }
}

/** 状态对应的原因字段标题。 */
export function reasonLabel(status: ReservationStatus): string {
  switch (status) {
    case 'rejected':
      return '驳回原因'
    case 'cancelled':
      return '取消原因'
    case 'missed':
      return '失约原因'
    default:
      return '原因'
  }
}
