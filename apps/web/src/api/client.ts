/**
 * 统一 API 客户端：
 * - 基础路径 /api（开发时由 Vite 代理到 Express，部署时同源）
 * - 统一解析 { error: { code, message, details } }
 * - 401 UNAUTHENTICATED 时通知会话层清理并跳转登录（可在登录/启动探测时跳过）
 */

export type QueryValue = string | number | boolean | null | undefined

export interface ApiErrorDetails {
  field?: string
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiErrorDetails | null

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details =
      details !== null && typeof details === 'object' ? (details as ApiErrorDetails) : null
  }
}

const FALLBACK_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: '提交的字段不合法，请检查后重试',
  UNAUTHENTICATED: '登录已过期，请重新登录',
  LOGIN_FAILED: '账号或密码错误',
  FORBIDDEN: '无权访问该资源',
  NOT_FOUND: '资源不存在',
  INVALID_STATE: '当前状态不允许该操作',
  PRICE_CHANGED: '房型价格已变化，请确认新价格',
  PET_OVERLAP: '该宠物在所选区间已有已确认或已入住的预约',
  ROOM_UNAVAILABLE: '房间不可用（房型、体重或区间冲突）',
  ROOM_IN_USE: '房间存在未完成预约，不能修改最大体重',
  LATE_REASON_REQUIRED: '延迟入住必须填写迟到原因',
  CHECKIN_DATE_INVALID: '当前日期不在允许入住区间',
  PAYMENT_INVALID: '请确认主人已核对账单并选择合法收款方式',
  NETWORK_ERROR: '无法连接服务器，请确认后端服务已启动',
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

/** 由路由/会话层注册；收到 401 UNAUTHENTICATED 时触发。 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, QueryValue>
  /** 登录、启动探测等场景不触发全局跳转。 */
  skipUnauthorizedHandler?: boolean
}

interface ParsedErrorPayload {
  code: string
  message: string
  details: unknown
}

function parseErrorPayload(payload: unknown): ParsedErrorPayload | null {
  if (payload === null || typeof payload !== 'object' || !('error' in payload)) return null
  const error = (payload as { error: unknown }).error
  if (error === null || typeof error !== 'object') return null
  const record = error as Record<string, unknown>
  const code = typeof record.code === 'string' ? record.code : ''
  if (!code) return null
  const message = typeof record.message === 'string' && record.message ? record.message : ''
  return {
    code,
    message: message || FALLBACK_MESSAGES[code] || '请求失败，请稍后重试',
    details: record.details ?? null,
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`/api${path}`, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET')
  const headers: Record<string, string> = { Accept: 'application/json' }
  let bodyText: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    bodyText = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: bodyText,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', FALLBACK_MESSAGES.NETWORK_ERROR ?? '网络错误', null)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const parsed = parseErrorPayload(payload)
    const error = parsed
      ? new ApiError(response.status, parsed.code, parsed.message, parsed.details)
      : new ApiError(
          response.status,
          'UNKNOWN_ERROR',
          `请求失败（HTTP ${response.status}）`,
          null,
        )
    if (
      response.status === 401 &&
      error.code === 'UNAUTHENTICATED' &&
      !options.skipUnauthorizedHandler
    ) {
      unauthorizedHandler?.()
    }
    throw error
  }

  return payload as T
}
