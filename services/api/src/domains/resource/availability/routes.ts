import { ValidationError } from '../../../lib/errors'
import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import type { IdentityEnv } from '../../identity/env'
import { listCurrentUserAvailability } from './service'

function readDateRange(request: Request): { from: string; to: string } {
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  if (!pattern.test(from) || !pattern.test(to) || to < from) {
    throw new ValidationError('from/to must be a valid ascending YYYY-MM-DD range')
  }
  return { from, to }
}

export function registerAvailabilityRoutes(app: Router<IdentityEnv>): void {
  app.get(
    '/v1/spaces/:spaceId/resources/:resourceId/slots',
    async ({ request, env, params }) => {
      const { from, to } = readDateRange(request)
      return ok(
        await listCurrentUserAvailability(
          env,
          request,
          params.spaceId,
          params.resourceId,
          from,
          to
        )
      )
    }
  )
}
