import { AppError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findMembershipByUserAndSpace } from '../../tenant/membership/repository'
import type { TenantDatabase } from '../../tenant/invite/repository'
import { ensureSeriesMaterialized } from '../series/service'
import {
  getAvailabilityContext,
  listAvailabilityRows,
  mapAvailabilitySlot,
  type AvailabilityDatabase,
  type AvailabilitySlot
} from './repository'

export type AvailabilityEnv = IdentityEnv

export async function listCurrentUserAvailability(
  env: AvailabilityEnv,
  request: Request,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string,
  now = Date.now()
): Promise<AvailabilitySlot[]> {
  const user = await requireCurrentUser(env, request)
  const membership = await findMembershipByUserAndSpace(
    env.DB as unknown as TenantDatabase,
    user.id,
    spaceId
  )
  if (!membership || membership.status !== 'active') {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  const db = env.DB as unknown as AvailabilityDatabase
  const context = await getAvailabilityContext(db, spaceId, resourceId)
  if (!context) {
    throw new AppError('NOT_FOUND', 'Resource not found')
  }
  if (context.space_status !== 'active') {
    throw new AppError('SPACE_DISABLED', 'Space is disabled')
  }
  if (context.resource_status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', 'Resource is inactive')
  }

  await ensureSeriesMaterialized(db, spaceId, resourceId, from, to)
  const rows = await listAvailabilityRows(db, spaceId, resourceId, from, to)
  return rows.map((row) => mapAvailabilitySlot(row, context, now))
}
