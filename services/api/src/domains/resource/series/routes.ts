import { getAdminPrincipal, requireAdminAccess, requireSpaceAdmin, type AdminAuthEnv } from '../../../lib/auth'
import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import type { IdentityEnv } from '../../identity/env'
import { createAdminSlotSeries } from './service'
import type { SeriesDatabase } from './repository'
import { parseCreateSlotSeriesInput } from './validation'

export type SeriesEnv = IdentityEnv & AdminAuthEnv

function db(env: SeriesEnv): SeriesDatabase {
  return env.DB as unknown as SeriesDatabase
}

export function registerSeriesRoutes(app: Router<SeriesEnv>): void {
  app.post(
    '/v1/admin/spaces/:spaceId/slot-series',
    async (context) => ok(
      await createAdminSlotSeries(
        db(context.env),
        context.params.spaceId,
        getAdminPrincipal(context).id,
        await parseJsonBody(context.request, parseCreateSlotSeriesInput)
      ),
      { status: 201 }
    ),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
