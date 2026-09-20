import { ok } from './lib/http'
import { errorBoundaryMiddleware, requestIdMiddleware } from './lib/middleware'
import { Router, type RouteContext as RuntimeRouteContext } from './lib/router'
import { registerIdentityRoutes } from './domains/identity/routes'
import type { IdentityEnv } from './domains/identity/env'

export type WorkerEnv = IdentityEnv
export type RouteContext = Pick<RuntimeRouteContext<WorkerEnv>, 'request' | 'env' | 'executionCtx'>

const app = new Router<WorkerEnv>()
app.use(requestIdMiddleware)
app.use(errorBoundaryMiddleware)

app.get('/health', () =>
  ok({
    status: 'ok',
    service: 'yuke-api'
  })
)

registerIdentityRoutes(app)

export async function router(context: RouteContext): Promise<Response> {
  return app.handle(context)
}
