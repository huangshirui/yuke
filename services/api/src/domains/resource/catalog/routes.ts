import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import {
  requireAdminAccess,
  requireSpaceAdmin,
  type AdminAuthEnv
} from '../../../lib/auth'
import { parseJsonBody } from '../../../lib/validation'
import type { IdentityEnv } from '../../identity/env'
import {
  changeAdminResource,
  changeAdminSlotType,
  createAdminResource,
  createAdminSlotType,
  listAdminResources,
  listAdminSlotTypes,
  listCurrentUserResources,
  setAdminResourceStatus,
  setAdminSlotTypeStatus
} from './service'
import {
  parseCreateResourceInput,
  parseCreateSlotTypeInput,
  parseUpdateResourceInput,
  parseUpdateSlotTypeInput
} from './validation'
import type { CatalogDatabase } from './repository'

export type CatalogEnv = IdentityEnv & AdminAuthEnv

function db(env: CatalogEnv): CatalogDatabase {
  return env.DB as unknown as CatalogDatabase
}

export function registerCatalogRoutes(app: Router<CatalogEnv>): void {
  app.get('/v1/spaces/:spaceId/resources', async ({ request, env, params }) =>
    ok(await listCurrentUserResources(env, request, params.spaceId))
  )

  app.get(
    '/v1/admin/spaces/:spaceId/resources',
    async ({ env, params }) => ok(await listAdminResources(db(env), params.spaceId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/resources',
    async ({ request, env, params }) =>
      ok(
        await createAdminResource(
          db(env),
          params.spaceId,
          await parseJsonBody(request, parseCreateResourceInput)
        ),
        { status: 201 }
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/resources/:resourceId',
    async ({ request, env, params }) =>
      ok(
        await changeAdminResource(
          db(env),
          params.spaceId,
          params.resourceId,
          await parseJsonBody(request, parseUpdateResourceInput)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/resources/:resourceId/deactivate',
    async ({ env, params }) =>
      ok(
        await setAdminResourceStatus(
          db(env),
          params.spaceId,
          params.resourceId,
          'inactive'
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/resources/:resourceId/activate',
    async ({ env, params }) =>
      ok(
        await setAdminResourceStatus(
          db(env),
          params.spaceId,
          params.resourceId,
          'active'
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/slot-types',
    async ({ env, params }) => ok(await listAdminSlotTypes(db(env), params.spaceId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slot-types',
    async ({ request, env, params }) =>
      ok(
        await createAdminSlotType(
          db(env),
          params.spaceId,
          await parseJsonBody(request, parseCreateSlotTypeInput)
        ),
        { status: 201 }
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/slot-types/:slotTypeId',
    async ({ request, env, params }) =>
      ok(
        await changeAdminSlotType(
          db(env),
          params.spaceId,
          params.slotTypeId,
          await parseJsonBody(request, parseUpdateSlotTypeInput)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slot-types/:slotTypeId/deactivate',
    async ({ env, params }) =>
      ok(
        await setAdminSlotTypeStatus(
          db(env),
          params.spaceId,
          params.slotTypeId,
          'inactive'
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slot-types/:slotTypeId/activate',
    async ({ env, params }) =>
      ok(
        await setAdminSlotTypeStatus(
          db(env),
          params.spaceId,
          params.slotTypeId,
          'active'
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
