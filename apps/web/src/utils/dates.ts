/**
 * 日期/时间工具：业务日期与时间展示统一按门店时区 Asia/Shanghai。
 * 业务日期为 YYYY-MM-DD；预约区间为 [startDate, endDate)。
 */

const SHANGHAI_TZ = 'Asia/Shanghai'
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function partMap(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return map
}

/** 门店时区“今天”，返回 YYYY-MM-DD。 */
export function todayInShanghai(): string {
  const map = partMap(new Date())
  return `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}`
}

/** 门店时区当前时刻，返回 YYYY-MM-DDTHH:mm（用于 datetime-local 默认值）。 */
export function nowLocalDateTimeInShanghai(): string {
  const map = partMap(new Date())
  return `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}T${map.hour ?? '00'}:${map.minute ?? '00'}`
}

/** 门店时区当前时间 HH:mm。 */
export function currentTimeInShanghai(): string {
  const map = partMap(new Date())
  return `${map.hour ?? '00'}:${map.minute ?? '00'}`
}

function parseDateUTC(value: string): Date {
  const [year, month, day] = value.split('-').map((item) => Number(item))
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 业务日期加减自然日。 */
export function addDays(date: string, days: number): string {
  const parsed = parseDateUTC(date)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return toIsoDate(parsed)
}

/** endDate - startDate 的自然日差。 */
export function diffDays(startDate: string, endDate: string): number {
  const start = parseDateUTC(startDate).getTime()
  const end = parseDateUTC(endDate).getTime()
  return Math.round((end - start) / 86_400_000)
}

/** 2026-11-01 → 2026年11月1日（周日）。 */
export function formatDateCN(date: string): string {
  if (!date) return '—'
  const parsed = parseDateUTC(date)
  if (Number.isNaN(parsed.getTime())) return date
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth() + 1
  const day = parsed.getUTCDate()
  const weekday = WEEKDAY_LABELS[parsed.getUTCDay()] ?? ''
  return `${year}年${month}月${day}日（${weekday}）`
}

/** 2026-11-01 → 11月1日（周日），用于紧凑展示。 */
export function formatDateShortCN(date: string): string {
  if (!date) return '—'
  const parsed = parseDateUTC(date)
  if (Number.isNaN(parsed.getTime())) return date
  const month = parsed.getUTCMonth() + 1
  const day = parsed.getUTCDate()
  const weekday = WEEKDAY_LABELS[parsed.getUTCDay()] ?? ''
  return `${month}月${day}日（${weekday}）`
}

/** 业务日期区间：2026年11月1日 → 2026年11月4日。 */
export function formatDateRangeCN(startDate: string, endDate: string): string {
  return `${formatDateCN(startDate)} → ${formatDateCN(endDate)}`
}

/** 从 ISO 时间戳取门店时区业务日期 YYYY-MM-DD。 */
export function shanghaiDateOf(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const map = partMap(date)
  return `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}`
}

/**
 * 时间展示（Asia/Shanghai）：
 * - 本地时间字符串 YYYY-MM-DDTHH:mm(:ss) 原样展示；
 * - 其他 ISO 时间戳转换为门店时区 YYYY-MM-DD HH:mm。
 */
export function formatDateTime(value: string): string {
  if (!value) return '—'
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value)
  if (local) {
    return `${local[1] ?? ''} ${local[2] ?? ''}`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const map = partMap(date)
  return `${map.year ?? ''}-${map.month ?? ''}-${map.day ?? ''} ${map.hour ?? ''}:${map.minute ?? ''}`
}

/** 把 datetime-local 值转换为提交给 API 的本地时间格式 YYYY-MM-DDTHH:mm。 */
export function toLocalApiDateTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)
  if (!match) return value
  return `${match[1] ?? ''}T${match[2] ?? ''}`
}

/** 在住照护任务默认计划时间：当前时刻 + 30 分钟，并限制在计划离店日 23:59 之前。 */
export function defaultCareTaskPlannedAt(plannedCheckOutDate: string, today: string): string {
  if (today > plannedCheckOutDate) {
    // 已逾期仍在住：计划时间不能晚于原计划离店日 23:59
    return `${plannedCheckOutDate}T20:00`
  }
  const map = partMap(new Date(Date.now() + 30 * 60_000))
  let date = `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}`
  let time = `${map.hour ?? '00'}:${map.minute ?? '00'}`
  if (date > plannedCheckOutDate) {
    date = plannedCheckOutDate
    time = '23:59'
  }
  return `${date}T${time}`
}
