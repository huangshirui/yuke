import type {
  CurrentSpaceResponse,
  JoinSpaceResponse,
  JoinSpaceInput,
  SpaceSummary,
  UpdateCurrentSpaceInput
} from '@yuke/shared'
import { AppError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findInviteByCode, type TenantDatabase } from '../invite/repository'
import {
  findMembershipByUserAndSpace,
  insertMembershipFromInviteIfValid,
  listSpacesForMember,
  setCurrentSpaceIfActiveMembership
} from './repository'

export type MembershipEnv = IdentityEnv

function tenantDb(env: MembershipEnv): TenantDatabase {
  return env.DB as unknown as TenantDatabase
}

function assertInviteUsable(
  lookup: Awaited<ReturnType<typeof findInviteByCode>>,
  now: number
): asserts lookup is NonNullable<typeof lookup> {
  if (!lookup) {
    throw new AppError('NOT_FOUND', 'InviteCode not found')
  }
  if (lookup.invite.status === 'revoked') {
    throw new AppError('INVITE_REVOKED', 'InviteCode has been revoked')
  }
  if (Date.parse(lookup.invite.expiresAt) <= now) {
    throw new AppError('INVITE_EXPIRED', 'InviteCode has expired')
  }
  if (lookup.space.status === 'disabled') {
    throw new AppError('SPACE_DISABLED', 'Space is disabled')
  }
}

export async function joinCurrentUserToSpace(
  env: MembershipEnv,
  request: Request,
  input: JoinSpaceInput
): Promise<JoinSpaceResponse> {
  const user = await requireCurrentUser(env, request)
  const db = tenantDb(env)
  const now = Date.now()

  const lookup = await findInviteByCode(db, input.inviteCode)
  assertInviteUsable(lookup, now)

  await insertMembershipFromInviteIfValid(db, {
    membershipId: `mem_${crypto.randomUUID().replace(/-/g, '')}`,
    userId: user.id,
    inviteCode: input.inviteCode,
    now
  })

  const membership = await findMembershipByUserAndSpace(
    db,
    user.id,
    lookup.space.id
  )

  if (!membership) {
    const latest = await findInviteByCode(db, input.inviteCode)
    assertInviteUsable(latest, Date.now())
    throw new AppError('INTERNAL_ERROR', 'Space membership creation failed')
  }

  if (membership.status !== 'active') {
    throw new AppError('SPACE_ACCESS_DENIED', 'Space membership is inactive')
  }

  const currentSpaceUpdated = await setCurrentSpaceIfActiveMembership(
    db,
    user.id,
    lookup.space.id,
    Date.now()
  )
  if (!currentSpaceUpdated) {
    throw new AppError('SPACE_ACCESS_DENIED', 'Space membership is inactive')
  }

  return {
    membership,
    space: lookup.space,
    currentSpaceId: lookup.space.id
  }
}

export async function listCurrentUserSpaces(
  env: MembershipEnv,
  request: Request
): Promise<SpaceSummary[]> {
  const user = await requireCurrentUser(env, request)
  return listSpacesForMember(tenantDb(env), user.id)
}

export async function changeCurrentSpace(
  env: MembershipEnv,
  request: Request,
  input: UpdateCurrentSpaceInput
): Promise<CurrentSpaceResponse> {
  const user = await requireCurrentUser(env, request)
  const updated = await setCurrentSpaceIfActiveMembership(
    tenantDb(env),
    user.id,
    input.spaceId,
    Date.now()
  )

  if (!updated) {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return {
    currentSpaceId: input.spaceId
  }
}
