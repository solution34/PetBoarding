/**
 * 错误读取工具：把统一错误结构 { error: { code, message, details } } 转为页面可用的信息。
 */
import { ApiError } from '../api/client'
import type { PriceChangedDetails } from '../api/types'

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试'
}

export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code
}

/** VALIDATION_ERROR 的 details.field，用于表单字段级提示。 */
export function getErrorField(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.details === null) return null
  const field = error.details.field
  return typeof field === 'string' && field ? field : null
}

/** 409 PRICE_CHANGED 的新价格信息；不匹配时返回 null。 */
export function parsePriceChange(error: unknown): PriceChangedDetails | null {
  if (!isApiErrorCode(error, 'PRICE_CHANGED') || !(error instanceof ApiError)) return null
  const details = error.details
  if (!details) return null
  const { dailyPriceFen, plannedDays, totalFen } = details
  if (
    typeof dailyPriceFen === 'number' &&
    typeof plannedDays === 'number' &&
    typeof totalFen === 'number'
  ) {
    return { dailyPriceFen, plannedDays, totalFen }
  }
  return null
}
