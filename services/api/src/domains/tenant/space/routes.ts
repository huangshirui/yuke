import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import {
  getAdminPrincipal,
  requireAdminAccess,
  requireSpaceAdmin,
  requireSuperAdmin,
  type AdminAuthEnv
} from '../../../lib/auth'
import { parseJsonBody } from '../../../lib/validation'
import type { IdentityEnv } from '../../identity/env'
import {
  addSpaceAdmin,
  changeSpace,
  changeSpaceSettings,
  createSpace,
  deleteSpaceAdmin,
  listVisibleSpaces,
  readSpaceAdmins,
  readSpaceSettings,
  setSpaceStatus
} from './service'
import {
  parseAdminUserId,
  parseCreateSpaceInput,
  parseUpdateSpaceInput,
  parseUpdateSpaceSettingsInput
} from './validation'
import type { SpaceDatabase } from './repository'

export type SpaceEnv = IdentityEnv & AdminAuthEnv

function db(env: SpaceEnv): SpaceDatabase {
  return env.DB as unknown as SpaceDatabase
}

export function registerSpaceRoutes(app: Router<SpaceEnv>): void {
  app.get(
    '/v1/admin/spaces',
    async (context) =>
      ok(await listVisibleSpaces(db(context.env), getAdminPrincipal(context))),
    [requireAdminAccess]
  )

  app.post(
    '/v1/admin/spaces',
    async ({ request, env }) =>
      ok(
        await createSpace(
          db(env),
          await parseJsonBody(request, parseCreateSpaceInput)
        ),
        { status: 201 }
      ),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId',
    async ({ request, env, params }) =>
      ok(
        await changeSpace(
          db(env),
          params.spaceId,
          await parseJsonBody(request, parseUpdateSpaceInput)
        )
      ),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/disable',
    async ({ env, params }) =>
      ok(await setSpaceStatus(db(env), params.spaceId, 'disabled')),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/activate',
    async ({ env, params }) =>
      ok(await setSpaceStatus(db(env), params.spaceId, 'active')),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/settings',
    async ({ env, params }) => ok(await readSpaceSettings(db(env), params.spaceId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/settings',
    async ({ request, env, params }) =>
      ok(
        await changeSpaceSettings(
          db(env),
          params.spaceId,
          await parseJsonBody(request, parseUpdateSpaceSettingsInput)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/admins',
    async ({ env, params }) => ok(await readSpaceAdmins(db(env), params.spaceId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/admins',
    async ({ request, env, params }) =>
      ok(
        await addSpaceAdmin(
          db(env),
          params.spaceId,
          await parseJsonBody(request, parseAdminUserId)
        )
      ),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.delete(
    '/v1/admin/spaces/:spaceId/admins/:adminUserId',
    async ({ env, params }) => {
      await deleteSpaceAdmin(
        db(env),
        params.spaceId,
        params.adminUserId
      )
      return ok({ removed: true })
    },
    [requireAdminAccess, requireSuperAdmin]
  )
}
