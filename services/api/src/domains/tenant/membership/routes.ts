import {
  requireAdminAccess,
  requireSpaceAdmin,
  type AdminAuthEnv
} from '../../../lib/auth'
import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import type { MembershipEnv } from './service'
import {
  changeAdminMemberNote,
  changeAdminParticipantNote,
  changeCurrentSpace,
  joinCurrentUserToSpace,
  listCurrentUserSpaces,
  listVisibleAdminMembers,
  readAdminMember
} from './service'
import {
  parseAdminMemberFilters,
  parseCurrentSpaceInput,
  parseJoinSpaceInput,
  parseUpdateAdminNoteInput
} from './validation'

export type MembershipRouteEnv = MembershipEnv & AdminAuthEnv

export function registerMembershipRoutes(app: Router<MembershipRouteEnv>): void {
  app.post('/v1/spaces/join', async ({ request, env }) =>
    ok(
      await joinCurrentUserToSpace(
        env,
        request,
        await parseJsonBody(request, parseJoinSpaceInput)
      )
    )
  )

  app.get('/v1/me/spaces', async ({ request, env }) =>
    ok(await listCurrentUserSpaces(env, request))
  )

  app.put('/v1/me/current-space', async ({ request, env }) =>
    ok(
      await changeCurrentSpace(
        env,
        request,
        await parseJsonBody(request, parseCurrentSpaceInput)
      )
    )
  )

  app.get(
    '/v1/admin/spaces/:spaceId/members',
    async ({ request, env, params }) =>
      ok(
        await listVisibleAdminMembers(
          env,
          params.spaceId,
          parseAdminMemberFilters(request)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/members/:membershipId',
    async ({ env, params }) =>
      ok(
        await readAdminMember(
          env,
          params.spaceId,
          params.membershipId
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/members/:membershipId',
    async ({ request, env, params }) =>
      ok(
        await changeAdminMemberNote(
          env,
          params.spaceId,
          params.membershipId,
          await parseJsonBody(request, parseUpdateAdminNoteInput)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/participants/:participantId',
    async ({ request, env, params }) =>
      ok(
        await changeAdminParticipantNote(
          env,
          params.spaceId,
          params.participantId,
          await parseJsonBody(request, parseUpdateAdminNoteInput)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
