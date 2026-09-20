import type { Participant } from '@yuke/shared'
import type { D1DatabaseLike } from '../../identity/env'

type ParticipantRow = {
  id: string
  space_id: string
  membership_id: string
  name: string
  birth_month: string
  user_note: string | null
  status: 'active' | 'inactive'
}

type MutationResult = {
  meta?: {
    changes?: number
  }
}

function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    birthMonth: row.birth_month,
    note: row.user_note,
    status: row.status
  }
}

export async function listParticipantsForMembership(
  db: D1DatabaseLike,
  input: { spaceId: string; membershipId: string }
): Promise<Participant[]> {
  const result = await db
    .prepare(`
      SELECT id,
             space_id,
             membership_id,
             name,
             birth_month,
             user_note,
             status
      FROM participants
      WHERE space_id = ?
        AND membership_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .bind(input.spaceId, input.membershipId)
    .all<ParticipantRow>()

  return (result.results ?? []).map(mapParticipant)
}

export async function findParticipantForMembership(
  db: D1DatabaseLike,
  input: { spaceId: string; membershipId: string; participantId: string }
): Promise<Participant | null> {
  const row = await db
    .prepare(`
      SELECT id,
             space_id,
             membership_id,
             name,
             birth_month,
             user_note,
             status
      FROM participants
      WHERE id = ?
        AND space_id = ?
        AND membership_id = ?
      LIMIT 1
    `)
    .bind(input.participantId, input.spaceId, input.membershipId)
    .first<ParticipantRow>()

  return row ? mapParticipant(row) : null
}

export async function findActiveParticipantForMembership(
  db: D1DatabaseLike,
  input: { spaceId: string; membershipId: string; participantId: string }
): Promise<Participant | null> {
  const row = await db
    .prepare(`
      SELECT id,
             space_id,
             membership_id,
             name,
             birth_month,
             user_note,
             status
      FROM participants
      WHERE id = ?
        AND space_id = ?
        AND membership_id = ?
        AND status = 'active'
      LIMIT 1
    `)
    .bind(input.participantId, input.spaceId, input.membershipId)
    .first<ParticipantRow>()

  return row ? mapParticipant(row) : null
}

export async function createParticipantForActiveMembership(
  db: D1DatabaseLike,
  input: {
    id: string
    spaceId: string
    membershipId: string
    userId: string
    name: string
    birthMonth: string
    note: string | null
    now: number
  }
): Promise<boolean> {
  const result = await db
    .prepare(`
      INSERT INTO participants (
        id,
        space_id,
        membership_id,
        name,
        birth_month,
        user_note,
        admin_note,
        status,
        created_at,
        updated_at
      )
      SELECT ?,
             space_memberships.space_id,
             space_memberships.id,
             ?,
             ?,
             ?,
             NULL,
             'active',
             ?,
             ?
      FROM space_memberships
      WHERE space_memberships.id = ?
        AND space_memberships.space_id = ?
        AND space_memberships.user_id = ?
        AND space_memberships.status = 'active'
    `)
    .bind(
      input.id,
      input.name,
      input.birthMonth,
      input.note,
      input.now,
      input.now,
      input.membershipId,
      input.spaceId,
      input.userId
    )
    .run() as MutationResult

  return (result.meta?.changes ?? 0) > 0
}

export async function updateParticipantForActiveMembership(
  db: D1DatabaseLike,
  input: {
    participantId: string
    spaceId: string
    membershipId: string
    userId: string
    name: string
    birthMonth: string
    note: string | null
    now: number
  }
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE participants
      SET name = ?,
          birth_month = ?,
          user_note = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND membership_id = ?
        AND EXISTS (
          SELECT 1
          FROM space_memberships
          WHERE space_memberships.id = participants.membership_id
            AND space_memberships.space_id = participants.space_id
            AND space_memberships.user_id = ?
            AND space_memberships.status = 'active'
        )
    `)
    .bind(
      input.name,
      input.birthMonth,
      input.note,
      input.now,
      input.participantId,
      input.spaceId,
      input.membershipId,
      input.userId
    )
    .run() as MutationResult

  return (result.meta?.changes ?? 0) > 0
}

export async function setParticipantStatusForActiveMembership(
  db: D1DatabaseLike,
  input: {
    participantId: string
    spaceId: string
    membershipId: string
    userId: string
    status: 'active' | 'inactive'
    now: number
  }
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE participants
      SET status = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
        AND membership_id = ?
        AND EXISTS (
          SELECT 1
          FROM space_memberships
          WHERE space_memberships.id = participants.membership_id
            AND space_memberships.space_id = participants.space_id
            AND space_memberships.user_id = ?
            AND space_memberships.status = 'active'
        )
    `)
    .bind(
      input.status,
      input.now,
      input.participantId,
      input.spaceId,
      input.membershipId,
      input.userId
    )
    .run() as MutationResult

  return (result.meta?.changes ?? 0) > 0
}
