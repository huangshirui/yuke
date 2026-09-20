import type {
  CreateParticipantInput,
  Participant,
  UpdateParticipantInput
} from '@yuke/shared'
import { AppError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import { findMembershipByUserAndSpace } from '../../tenant/membership/repository'
import {
  createParticipantForActiveMembership,
  findParticipantForMembership,
  listParticipantsForMembership,
  setParticipantStatusForActiveMembership,
  updateParticipantForActiveMembership
} from './repository'

export type ParticipantEnv = IdentityEnv

async function requireActiveMembership(
  env: ParticipantEnv,
  request: Request,
  spaceId: string
): Promise<{ userId: string; membershipId: string }> {
  const user = await requireCurrentUser(env, request)
  const membership = await findMembershipByUserAndSpace(
    env.DB,
    user.id,
    spaceId
  )

  if (!membership || membership.status !== 'active') {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return {
    userId: user.id,
    membershipId: membership.id
  }
}

async function requireOwnedParticipant(
  env: ParticipantEnv,
  spaceId: string,
  membershipId: string,
  participantId: string
): Promise<Participant> {
  const participant = await findParticipantForMembership(env.DB, {
    spaceId,
    membershipId,
    participantId
  })

  if (!participant) {
    // Do not reveal whether the Participant exists under another membership.
    throw new AppError('NOT_FOUND', 'Participant not found')
  }

  return participant
}

export async function listCurrentUserParticipants(
  env: ParticipantEnv,
  request: Request,
  spaceId: string
): Promise<Participant[]> {
  const membership = await requireActiveMembership(env, request, spaceId)
  return listParticipantsForMembership(env.DB, {
    spaceId,
    membershipId: membership.membershipId
  })
}

export async function createCurrentUserParticipant(
  env: ParticipantEnv,
  request: Request,
  spaceId: string,
  input: CreateParticipantInput
): Promise<Participant> {
  const membership = await requireActiveMembership(env, request, spaceId)
  const participantId = `par_${crypto.randomUUID().replace(/-/g, '')}`
  const now = Date.now()

  const created = await createParticipantForActiveMembership(env.DB, {
    id: participantId,
    spaceId,
    membershipId: membership.membershipId,
    userId: membership.userId,
    name: input.name,
    birthMonth: input.birthMonth,
    note: input.note ?? null,
    now
  })

  if (!created) {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return requireOwnedParticipant(
    env,
    spaceId,
    membership.membershipId,
    participantId
  )
}

export async function updateCurrentUserParticipant(
  env: ParticipantEnv,
  request: Request,
  spaceId: string,
  participantId: string,
  input: UpdateParticipantInput
): Promise<Participant> {
  const membership = await requireActiveMembership(env, request, spaceId)
  const existing = await requireOwnedParticipant(
    env,
    spaceId,
    membership.membershipId,
    participantId
  )

  const updated = await updateParticipantForActiveMembership(env.DB, {
    participantId,
    spaceId,
    membershipId: membership.membershipId,
    userId: membership.userId,
    name: input.name ?? existing.name,
    birthMonth: input.birthMonth ?? existing.birthMonth,
    note: input.note === undefined ? existing.note : input.note,
    now: Date.now()
  })

  if (!updated) {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return requireOwnedParticipant(
    env,
    spaceId,
    membership.membershipId,
    participantId
  )
}

export async function setCurrentUserParticipantStatus(
  env: ParticipantEnv,
  request: Request,
  spaceId: string,
  participantId: string,
  status: 'active' | 'inactive'
): Promise<Participant> {
  const membership = await requireActiveMembership(env, request, spaceId)
  await requireOwnedParticipant(
    env,
    spaceId,
    membership.membershipId,
    participantId
  )

  const updated = await setParticipantStatusForActiveMembership(env.DB, {
    participantId,
    spaceId,
    membershipId: membership.membershipId,
    userId: membership.userId,
    status,
    now: Date.now()
  })

  if (!updated) {
    throw new AppError('SPACE_ACCESS_DENIED', 'Active Space membership is required')
  }

  return requireOwnedParticipant(
    env,
    spaceId,
    membership.membershipId,
    participantId
  )
}
