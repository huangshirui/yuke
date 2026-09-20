import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import {
  getAdminPrincipal,
  requireAdminAccess,
  requireSpaceAdmin
} from '../../../lib/auth'
import { parseJsonBody } from '../../../lib/validation'
import type { SpaceEnv } from '../space/routes'
import type { TenantDatabase } from './repository'
import {
  createAdminInvite,
  listAdminInvites,
  readAdminInviteMembers,
  revokeAdminInvite
} from './service'
import { parseCreateInviteInput } from './validation'

function db(env: SpaceEnv): TenantDatabase {
  return env.DB as unknown as TenantDatabase
}

export function registerInviteRoutes(app: Router<SpaceEnv>): void {
  app.get(
    '/v1/admin/spaces/:spaceId/invites',
    async ({ env, params }) =>
      ok(await listAdminInvites(db(env), params.spaceId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/invites',
    async (context) =>
      ok(
        await createAdminInvite(
          db(context.env),
          context.params.spaceId,
          getAdminPrincipal(context),
          await parseJsonBody(context.request, (value) =>
            parseCreateInviteInput(value)
          )
        ),
        { status: 201 }
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/invites/:inviteId/revoke',
    async ({ env, params }) =>
      ok(
        await revokeAdminInvite(
          db(env),
          params.spaceId,
          params.inviteId
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/invites/:inviteId/members',
    async ({ env, params }) =>
      ok(
        await readAdminInviteMembers(
          db(env),
          params.spaceId,
          params.inviteId
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
