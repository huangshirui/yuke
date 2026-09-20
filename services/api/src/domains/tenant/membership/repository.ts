import type {
  SpaceMembershipSummary,
  SpaceSummary
} from '@yuke/shared'
import type { TenantDatabase } from '../invite/repository'

type MembershipRow = {
  id: string
  space_id: string
  user_id: string
  invited_by_admin_id: string
  invite_code_id: string
  status: 'active' | 'inactive'
  joined_at: number
}

type SpaceRow = {
  id: string
  name: string
  timezone: string
  status: 'active' | 'disabled'
}

function mapMembership(row: MembershipRow): SpaceMembershipSummary {
  return {
    id: row.id,
    spaceId: row.space_id,
    invitedByAdminId: row.invited_by_admin_id,
    inviteCodeId: row.invite_code_id,
    status: row.status,
    joinedAt: new Date(row.joined_at).toISOString()
  }
}

function mapSpace(row: SpaceRow): SpaceSummary {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    status: row.status
  }
}

export async function findMembershipByUserAndSpace(
  db: TenantDatabase,
  userId: string,
  spaceId: string
): Promise<SpaceMembershipSummary | null> {
  const row = await db
    .prepare(`
      SELECT id,
             space_id,
             user_id,
             invited_by_admin_id,
             invite_code_id,
             status,
             joined_at
      FROM space_memberships
      WHERE user_id = ?
        AND space_id = ?
      LIMIT 1
    `)
    .bind(userId, spaceId)
    .first<MembershipRow>()

  return row ? mapMembership(row) : null
}

export async function insertMembershipFromInviteIfValid(
  db: TenantDatabase,
  input: {
    membershipId: string
    userId: string
    inviteCode: string
    now: number
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT OR IGNORE INTO space_memberships (
        id,
        space_id,
        user_id,
        invited_by_admin_id,
        invite_code_id,
        status,
        admin_note,
        joined_at,
        updated_at
      )
      SELECT ?,
             invite_codes.space_id,
             ?,
             invite_codes.created_by_admin_id,
             invite_codes.id,
             'active',
             NULL,
             ?,
             ?
      FROM invite_codes
      JOIN spaces ON spaces.id = invite_codes.space_id
      WHERE invite_codes.code = ?
        AND invite_codes.status = 'active'
        AND invite_codes.expires_at > ?
        AND spaces.status = 'active'
    `)
    .bind(
      input.membershipId,
      input.userId,
      input.now,
      input.now,
      input.inviteCode,
      input.now
    )
    .run()
}

export async function setCurrentSpaceIfActiveMembership(
  db: TenantDatabase,
  userId: string,
  spaceId: string,
  now: number
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE users
      SET last_space_id = ?,
          updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND EXISTS (
          SELECT 1
          FROM space_memberships
          WHERE space_memberships.user_id = users.id
            AND space_memberships.space_id = ?
            AND space_memberships.status = 'active'
        )
    `)
    .bind(spaceId, now, userId, spaceId)
    .run() as { meta?: { changes?: number } }

  return (result.meta?.changes ?? 0) > 0
}

export async function listSpacesForMember(
  db: TenantDatabase,
  userId: string
): Promise<SpaceSummary[]> {
  const result = await db
    .prepare(`
      SELECT spaces.id,
             spaces.name,
             spaces.timezone,
             spaces.status
      FROM space_memberships
      JOIN spaces ON spaces.id = space_memberships.space_id
      WHERE space_memberships.user_id = ?
        AND space_memberships.status = 'active'
      ORDER BY space_memberships.joined_at ASC, spaces.id ASC
    `)
    .bind(userId)
    .all<SpaceRow>()

  return (result.results ?? []).map(mapSpace)
}
