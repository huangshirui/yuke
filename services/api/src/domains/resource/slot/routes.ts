import { getAdminPrincipal, requireAdminAccess, requireSpaceAdmin, type AdminAuthEnv } from '../../../lib/auth'
import { ValidationError } from '../../../lib/errors'
import { ok } from '../../../lib/http'
import type { Router } from '../../../lib/router'
import { parseJsonBody } from '../../../lib/validation'
import type { IdentityEnv } from '../../identity/env'
import { ensureSeriesMaterialized } from '../series/service'
import {
  cancelAdminSlot,
  changeAdminSingleSlot,
  createAdminSlot,
  listAdminSlotsByLocalDateRange,
  setAdminSlotStatus
} from './service'
import type { SlotDatabase } from './repository'
import { parseCreateSlotInput, parseUpdateSingleSlotInput } from './validation'

export type SlotEnv = IdentityEnv & AdminAuthEnv

function db(env: SlotEnv): SlotDatabase {
  return env.DB as unknown as SlotDatabase
}

function requireDateQuery(request: Request): { from: string; to: string } {
  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    throw new ValidationError('from/to must be a valid ascending YYYY-MM-DD range')
  }
  return { from, to }
}

export function registerSlotRoutes(app: Router<SlotEnv>): void {
  app.get(
    '/v1/admin/spaces/:spaceId/resources/:resourceId/slots',
    async ({ request, env, params }) => {
      const { from, to } = requireDateQuery(request)
      await ensureSeriesMaterialized(
        env.DB as unknown as import('../series/repository').SeriesDatabase,
        params.spaceId,
        params.resourceId,
        from,
        to
      )
      return ok(await listAdminSlotsByLocalDateRange(db(env), params.spaceId, params.resourceId, from, to))
    },
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slots',
    async (context) => ok(
      await createAdminSlot(
        db(context.env),
        context.params.spaceId,
        getAdminPrincipal(context).id,
        await parseJsonBody(context.request, parseCreateSlotInput)
      ),
      { status: 201 }
    ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.patch(
    '/v1/admin/spaces/:spaceId/slots/:slotId',
    async ({ request, env, params }) => ok(
      await changeAdminSingleSlot(
        db(env),
        params.spaceId,
        params.slotId,
        await parseJsonBody(request, parseUpdateSingleSlotInput)
      )
    ),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slots/:slotId/freeze',
    async ({ env, params }) => ok(await setAdminSlotStatus(db(env), params.spaceId, params.slotId, 'frozen')),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slots/:slotId/unfreeze',
    async ({ env, params }) => ok(await setAdminSlotStatus(db(env), params.spaceId, params.slotId, 'open')),
    [requireAdminAccess, requireSpaceAdmin()]
  )

  app.post(
    '/v1/admin/spaces/:spaceId/slots/:slotId/cancel',
    async ({ env, params }) => ok(await cancelAdminSlot(db(env), params.spaceId, params.slotId)),
    [requireAdminAccess, requireSpaceAdmin()]
  )
}
