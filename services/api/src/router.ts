import { registerAdminProvisioningRoutes } from './domains/identity/admin-routes'
import { registerIdentityRoutes } from './domains/identity/routes'
import { registerCatalogRoutes } from './domains/resource/catalog/routes'
import { registerAvailabilityRoutes } from './domains/resource/availability/routes'
import { registerSeriesRoutes } from './domains/resource/series/routes'
import { registerSlotRoutes } from './domains/resource/slot/routes'
import type { IdentityEnv } from './domains/identity/env'
import { registerBookingRoutes } from './domains/reservation/booking/routes'
import { registerParticipantRoutes } from './domains/reservation/participant/routes'
import { registerInviteRoutes } from './domains/tenant/invite/routes'
import { registerMembershipRoutes } from './domains/tenant/membership/routes'
import { registerSpaceRoutes } from './domains/tenant/space/routes'
import type { SpaceEnv } from './domains/tenant/space/routes'
import { ok } from './lib/http'
import { errorBoundaryMiddleware, requestIdMiddleware } from './lib/middleware'
import { Router, type RouteContext as RuntimeRouteContext } from './lib/router'

export type WorkerEnv = IdentityEnv & SpaceEnv
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
registerAdminProvisioningRoutes(app)
registerSpaceRoutes(app)
registerInviteRoutes(app)
registerMembershipRoutes(app)
registerParticipantRoutes(app)
registerBookingRoutes(app)
registerCatalogRoutes(app)
registerSlotRoutes(app)
registerSeriesRoutes(app)
registerAvailabilityRoutes(app)

export async function router(context: RouteContext): Promise<Response> {
  return app.handle(context)
}
