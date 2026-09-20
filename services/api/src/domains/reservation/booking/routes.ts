import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import { createCurrentUserBooking, type BookingEnv } from './service'
import { parseCreateBookingInput } from './validation'

export function registerBookingRoutes(app: Router<BookingEnv>): void {
  app.post(
    '/v1/spaces/:spaceId/bookings',
    async ({ request, env, params }) =>
      ok(
        await createCurrentUserBooking(
          env,
          request,
          params.spaceId,
          await parseJsonBody(request, parseCreateBookingInput)
        ),
        { status: 201 }
      )
  )
}
