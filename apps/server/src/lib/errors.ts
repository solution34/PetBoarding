import type { NextFunction, Request, Response } from 'express'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  static validation(message: string, field?: string): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, field ? { field } : undefined)
  }

  static unauthenticated(message = '请先登录'): ApiError {
    return new ApiError(401, 'UNAUTHENTICATED', message)
  }

  static loginFailed(): ApiError {
    return new ApiError(401, 'LOGIN_FAILED', '账号或密码错误')
  }

  static forbidden(message = '没有权限执行该操作'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message)
  }

  static notFound(message = '资源不存在'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message)
  }

  static invalidState(message: string): ApiError {
    return new ApiError(409, 'INVALID_STATE', message)
  }

  static conflict(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(409, code, message, details)
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `接口不存在：${req.method} ${req.originalUrl}`
    }
  })
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details })
      }
    })
    return
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '请求体不是合法的 JSON' }
    })
    return
  }
  console.error('[server] 未处理异常：', err)
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误，请稍后重试' }
  })
}
