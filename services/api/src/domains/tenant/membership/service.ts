import type {
  AdminMemberDetail,
  AdminMemberSummary,
  CurrentSpaceResponse,
  JoinSpaceResponse,
  JoinSpaceInput,
  SpaceSummary,
  UpdateAdminNoteInput,
  UpdateCurrentSpaceInput
} from '@yuke/shared'
import { AppError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findInviteByCode, type TenantDatabase } from '../invite/repository'
import {
  adminMembershipSpaceExists,
  findAdminMember,
  findMembershipByUserAndSpace,
  insertMembershipFromInviteIfValid,
  listAdminMembers,
  listSpacesForMember,
  setCurrentSpaceIfActiveMembership,
  updateAdminMemberNote,
  updateAdminParticipantNote,
  type AdminMemberFilters
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


async function requireAdminMembershipSpace(
  db: TenantDatabase,
  spaceId: string
): Promise<void> {
  if (!(await adminMembershipSpaceExists(db, spaceId))) {
    throw new AppError('NOT_FOUND', 'Space not found')
  }
}

export async function listVisibleAdminMembers(
  env: MembershipEnv,
  spaceId: string,
  filters: AdminMemberFilters
): Promise<AdminMemberSummary[]> {
  const db = tenantDb(env)
  await requireAdminMembershipSpace(db, spaceId)
  return listAdminMembers(db, spaceId, filters)
}

export async function readAdminMember(
  env: MembershipEnv,
  spaceId: string,
  membershipId: string
): Promise<AdminMemberDetail> {
  const db = tenantDb(env)
  await requireAdminMembershipSpace(db, spaceId)
  const member = await findAdminMember(db, spaceId, membershipId)
  if (!member) {
    throw new AppError('NOT_FOUND', 'Member not found')
  }
  return member
}

export async function changeAdminMemberNote(
  env: MembershipEnv,
  spaceId: string,
  membershipId: string,
  input: UpdateAdminNoteInput
): Promise<AdminMemberDetail> {
  const db = tenantDb(env)
  await requireAdminMembershipSpace(db, spaceId)

  const updated = await updateAdminMemberNote(db, {
    spaceId,
    membershipId,
    adminNote: input.adminNote,
    now: Date.now()
  })
  if (!updated) {
    throw new AppError('NOT_FOUND', 'Member not found')
  }

  const member = await findAdminMember(db, spaceId, membershipId)
  if (!member) {
    throw new AppError('INTERNAL_ERROR', 'Member note update failed')
  }
  return member
}

export async function changeAdminParticipantNote(
  env: MembershipEnv,
  spaceId: string,
  participantId: string,
  input: UpdateAdminNoteInput
): Promise<{ updated: true }> {
  const db = tenantDb(env)
  await requireAdminMembershipSpace(db, spaceId)

  const updated = await updateAdminParticipantNote(db, {
    spaceId,
    participantId,
    adminNote: input.adminNote,
    now: Date.now()
  })
  if (!updated) {
    throw new AppError('NOT_FOUND', 'Participant not found')
  }

  return { updated: true }
}
