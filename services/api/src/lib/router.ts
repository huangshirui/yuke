import { AppError, normalizeError } from './errors'
import { errorResponse } from './http'

export type RouteParams = Record<string, string>

export type RouteContext<Env = unknown> = {
  request: Request
  url: URL
  env: Env
  executionCtx?: unknown
  params: RouteParams
  requestId: string
}

export type RouteHandler<Env = unknown> = (context: RouteContext<Env>) => Response | Promise<Response>
export type Next = () => Promise<Response>
export type Middleware<Env = unknown> = (context: RouteContext<Env>, next: Next) => Response | Promise<Response>

type CompiledRoute<Env> = {
  method: string
  pattern: string
  matcher: RegExp
  paramNames: string[]
  middleware: Middleware<Env>[]
  handler: RouteHandler<Env>
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compilePath(pattern: string): { matcher: RegExp; paramNames: string[] } {
  if (!pattern.startsWith('/')) {
    throw new Error(`Route pattern must start with '/': ${pattern}`)
  }

  if (pattern === '/') {
    return { matcher: /^\/$/, paramNames: [] }
  }

  const paramNames: string[] = []
  const source = pattern
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(':')) {
        const name = segment.slice(1)
        if (!name) {
          throw new Error(`Route parameter name is required: ${pattern}`)
        }
        paramNames.push(name)
        return '([^/]+)'
      }
      return escapeRegex(segment)
    })
    .join('/')

  return { matcher: new RegExp(`^/${source}/?$`), paramNames }
}

function matchRoute(route: CompiledRoute<unknown>, pathname: string): RouteParams | null {
  const match = route.matcher.exec(pathname)
  if (!match) {
    return null
  }

  const params: RouteParams = {}
  for (let index = 0; index < route.paramNames.length; index += 1) {
    params[route.paramNames[index]] = decodeURIComponent(match[index + 1])
  }
  return params
}

export class Router<Env = unknown> {
  private readonly routes: CompiledRoute<Env>[] = []
  private readonly middleware: Middleware<Env>[] = []

  use(middleware: Middleware<Env>): this {
    this.middleware.push(middleware)
    return this
  }

  on(
    method: string,
    pattern: string,
    handler: RouteHandler<Env>,
    middleware: Middleware<Env>[] = []
  ): this {
    const { matcher, paramNames } = compilePath(pattern)
    this.routes.push({ method: method.toUpperCase(), pattern, matcher, paramNames, middleware, handler })
    return this
  }

  get(pattern: string, handler: RouteHandler<Env>, middleware?: Middleware<Env>[]): this {
    return this.on('GET', pattern, handler, middleware)
  }

  post(pattern: string, handler: RouteHandler<Env>, middleware?: Middleware<Env>[]): this {
    return this.on('POST', pattern, handler, middleware)
  }

  patch(pattern: string, handler: RouteHandler<Env>, middleware?: Middleware<Env>[]): this {
    return this.on('PATCH', pattern, handler, middleware)
  }

  put(pattern: string, handler: RouteHandler<Env>, middleware?: Middleware<Env>[]): this {
    return this.on('PUT', pattern, handler, middleware)
  }

  delete(pattern: string, handler: RouteHandler<Env>, middleware?: Middleware<Env>[]): this {
    return this.on('DELETE', pattern, handler, middleware)
  }

  async handle(input: { request: Request; env: Env; executionCtx?: unknown }): Promise<Response> {
    const url = new URL(input.request.url)
    let handler: RouteHandler<Env> = () => {
      throw new AppError('NOT_FOUND', 'Not Found')
    }
    let params: RouteParams = {}
    let routeMiddleware: Middleware<Env>[] = []

    for (const route of this.routes) {
      if (route.method !== input.request.method.toUpperCase()) {
        continue
      }
      const matchedParams = matchRoute(route as CompiledRoute<unknown>, url.pathname)
      if (matchedParams !== null) {
        handler = route.handler
        params = matchedParams
        routeMiddleware = route.middleware
        break
      }
    }

    const context: RouteContext<Env> = {
      request: input.request,
      url,
      env: input.env,
      executionCtx: input.executionCtx,
      params,
      requestId: crypto.randomUUID()
    }

    const chain = [...this.middleware, ...routeMiddleware]
    let cursor = -1

    const dispatch = async (index: number): Promise<Response> => {
      if (index <= cursor) {
        throw new Error('next() called multiple times')
      }
      cursor = index
      const current = chain[index]
      if (current) {
        return current(context, () => dispatch(index + 1))
      }
      return handler(context)
    }

    try {
      return await dispatch(0)
    } catch (error) {
      return errorResponse(normalizeError(error))
    }
  }
}
