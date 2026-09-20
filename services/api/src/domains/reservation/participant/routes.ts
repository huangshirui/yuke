import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import {
  createCurrentUserParticipant,
  listCurrentUserParticipants,
  setCurrentUserParticipantStatus,
  updateCurrentUserParticipant,
  type ParticipantEnv
} from './service'
import {
  parseCreateParticipantInput,
  parseUpdateParticipantInput
} from './validation'

export function registerParticipantRoutes(app: Router<ParticipantEnv>): void {
  app.get('/v1/spaces/:spaceId/participants', async ({ request, env, params }) =>
    ok(await listCurrentUserParticipants(env, request, params.spaceId))
  )

  app.post('/v1/spaces/:spaceId/participants', async ({ request, env, params }) =>
    ok(
      await createCurrentUserParticipant(
        env,
        request,
        params.spaceId,
        await parseJsonBody(request, parseCreateParticipantInput)
      ),
      { status: 201 }
    )
  )

  app.patch(
    '/v1/spaces/:spaceId/participants/:participantId',
    async ({ request, env, params }) =>
      ok(
        await updateCurrentUserParticipant(
          env,
          request,
          params.spaceId,
          params.participantId,
          await parseJsonBody(request, parseUpdateParticipantInput)
        )
      )
  )

  app.post(
    '/v1/spaces/:spaceId/participants/:participantId/deactivate',
    async ({ request, env, params }) =>
      ok(
        await setCurrentUserParticipantStatus(
          env,
          request,
          params.spaceId,
          params.participantId,
          'inactive'
        )
      )
  )

  app.post(
    '/v1/spaces/:spaceId/participants/:participantId/activate',
    async ({ request, env, params }) =>
      ok(
        await setCurrentUserParticipantStatus(
          env,
          request,
          params.spaceId,
          params.participantId,
          'active'
        )
      )
  )
}
