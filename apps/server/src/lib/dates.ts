const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

/** 门店“今天”，按 Asia/Shanghai 计算；演示/验收可传入固定日期。 */
export function todayShanghai(override?: string | null): string {
  if (override && isDateString(override)) return override
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/** [startDate, endDate) 的自然日差。调用前应保证日期合法且 start < end。 */
export function dayDiff(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000
  )
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function shanghaiDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(iso))
}

export function shanghaiDateTimeText(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso))
}

/** 解析业务时间输入：YYYY-MM-DDTHH:mm(:ss)（按 Asia/Shanghai）或带时区 ISO。 */
export function parseLocalDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const local = LOCAL_DATE_TIME_RE.exec(trimmed)
  if (local) {
    const datePart = local[1]
    if (!isDateString(datePart)) return null
    const hour = Number(local[2])
    const minute = Number(local[3])
    const second = Number(local[4] ?? '0')
    if (hour > 23 || minute > 59 || second > 59) return null
    const parsed = new Date(`${datePart}T${local[2]}:${local[3]}:${String(second).padStart(2, '0')}+08:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** 某业务日期在 Asia/Shanghai 的最后一毫秒。 */
export function endOfBusinessDate(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+08:00`)
}

export function startOfBusinessDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000+08:00`)
}

export function maxDateString(a: string, b: string): string {
  return a >= b ? a : b
}
