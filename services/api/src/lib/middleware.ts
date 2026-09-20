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
