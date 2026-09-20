import { normalizeError } from './errors'
import { errorResponse } from './http'
import type { Middleware } from './router'

export const errorBoundaryMiddleware: Middleware<unknown> = async (_context, next) => {
  try {
    return await next()
  } catch (error) {
    return errorResponse(normalizeError(error))
  }
}

export const requestIdMiddleware: Middleware<unknown> = async (context, next) => {
  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('x-request-id', context.requestId)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}


const ADMIN_API_PREFIX = '/v1/admin/'
const ADMIN_CORS_METHOD_VALUES = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] as const
const ADMIN_CORS_METHODS = ADMIN_CORS_METHOD_VALUES.join(', ')
const ADMIN_CORS_HEADERS = 'content-type'

export type AdminCorsEnv = {
  ADMIN_ORIGIN?: string
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('vary')
  const values = current
    ? current.split(',').map((item) => item.trim().toLowerCase())
    : []
  if (!values.includes(value.toLowerCase())) {
    headers.set('vary', current ? current + ', ' + value : value)
  }
}

function withAdminCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-credentials', 'true')
  appendVary(headers, 'Origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export function createAdminCorsMiddleware<Env extends AdminCorsEnv>(): Middleware<Env> {
  return async (context, next) => {
    if (!context.url.pathname.startsWith(ADMIN_API_PREFIX)) {
      return next()
    }

    const requestOrigin = context.request.headers.get('origin')
    const allowedOrigin = context.env.ADMIN_ORIGIN?.trim()

    if (context.request.method.toUpperCase() === 'OPTIONS') {
      if (!allowedOrigin || requestOrigin !== allowedOrigin) {
        return new Response(null, { status: 403 })
      }

      const requestedMethod =
        context.request.headers.get('access-control-request-method')?.toUpperCase()
      if (
        !requestedMethod ||
        !ADMIN_CORS_METHOD_VALUES.includes(
          requestedMethod as (typeof ADMIN_CORS_METHOD_VALUES)[number]
        )
      ) {
        return new Response(null, { status: 405 })
      }

      const headers = new Headers({
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': ADMIN_CORS_METHODS,
        'access-control-allow-headers': ADMIN_CORS_HEADERS,
        'access-control-max-age': '600'
      })
      appendVary(headers, 'Origin')
      appendVary(headers, 'Access-Control-Request-Method')
      appendVary(headers, 'Access-Control-Request-Headers')
      return new Response(null, { status: 204, headers })
    }

    if (requestOrigin && (!allowedOrigin || requestOrigin !== allowedOrigin)) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'SPACE_ACCESS_DENIED',
            message: 'Cross-origin Admin request is not allowed'
          }
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json; charset=UTF-8' }
        }
      )
    }

    const response = await next()
    return requestOrigin && allowedOrigin
      ? withAdminCors(response, allowedOrigin)
      : response
  }
}
