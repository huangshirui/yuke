import {
  getAdminPrincipal,
  requireAdminAccess,
  requireSpaceAdmin,
  type AdminAuthEnv
} from '../../../lib/auth'
import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import {
  cancelAdminBooking,
  cancelCurrentUserBooking,
  completeAdminBooking,
  createCurrentUserBooking,
  listCurrentUserBookings,
  listVisibleAdminBookings,
  readAdminBooking,
  readCurrentUserBooking,
  updateAdminBooking,
  type BookingEnv
} from './service'
import {
  parseBookingListFilters,
  parseCreateBookingInput,
  parseUpdateAdminBookingInput
} from './validation'

export type BookingRouteEnv = BookingEnv & AdminAuthEnv

export function registerBookingRoutes(app: Router<BookingRouteEnv>): void {
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

  app.get(
    '/v1/spaces/:spaceId/bookings',
    async ({ request, env, params }) =>
      ok(
        await listCurrentUserBookings(
          env,
          request,
          params.spaceId,
          parseBookingListFilters(request)
        )
      )
  )

  app.get(
    '/v1/spaces/:spaceId/bookings/:bookingId',
    async ({ request, env, params }) =>
      ok(
        await readCurrentUserBooking(
          env,
          request,
          params.spaceId,
          params.bookingId
        )
      )
  )

  app.post(
    '/v1/spaces/:spaceId/bookings/:bookingId/cancel',
    async ({ request, env, params }) =>
      ok(
        await cancelCurrentUserBooking(
          env,
          request,
          params.spaceId,
          params.bookingId
        )
      )
  )

  app.get(
    '/v1/admin/spaces/:spaceId/bookings',
    async ({ request, env, params }) =>
      ok(
        await listVisibleAdminBookings(
          env,
          params.spaceId,
          parseBookingListFilters(request, true)
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.get(
    '/v1/admin/spaces/:spaceId/bookings/:bookingId',
    async ({ env, params }) =>
      ok(await readAdminBooking(env, params.spaceId, params.bookingId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/bookings/:bookingId',
    async (context) =>
      ok(
        await updateAdminBooking(
          context.env,
          context.params.spaceId,
          context.params.bookingId,
          getAdminPrincipal(context).id,
          await parseJsonBody(
            context.request,
            parseUpdateAdminBookingInput
          )
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/bookings/:bookingId/cancel',
    async (context) =>
      ok(
        await cancelAdminBooking(
          context.env,
          context.params.spaceId,
          context.params.bookingId,
          getAdminPrincipal(context).id
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/bookings/:bookingId/complete',
    async (context) =>
      ok(
        await completeAdminBooking(
          context.env,
          context.params.spaceId,
          context.params.bookingId,
          getAdminPrincipal(context).id
        )
      ),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
