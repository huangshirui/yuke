import type { ApiError, ApiResponse } from '@yuke/shared'
import { AppError, ERROR_STATUS_BY_CODE } from './errors'

const JSON_CONTENT_TYPE = 'application/json; charset=UTF-8'

function withJsonHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  if (!result.has('content-type')) {
    result.set('content-type', JSON_CONTENT_TYPE)
  }
  result.set('x-content-type-options', 'nosniff')
  return result
}

export function jsonResponse<T>(body: ApiResponse<T>, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: withJsonHeaders(init.headers)
  })
}

export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return jsonResponse({ data }, init)
}

export function fail(error: ApiError, init: Omit<ResponseInit, 'status'> = {}): Response {
  return jsonResponse(
    { error },
    {
      ...init,
      status: ERROR_STATUS_BY_CODE[error.code]
    }
  )
}

export function errorResponse(error: AppError): Response {
  return fail({
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details })
  })
}
