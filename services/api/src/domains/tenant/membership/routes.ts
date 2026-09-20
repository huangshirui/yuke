import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import type { MembershipEnv } from './service'
import {
  changeCurrentSpace,
  joinCurrentUserToSpace,
  listCurrentUserSpaces
} from './service'
import {
  parseCurrentSpaceInput,
  parseJoinSpaceInput
} from './validation'

export function registerMembershipRoutes(app: Router<MembershipEnv>): void {
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
}
