import type {
  InviteMemberSummary,
  InviteStatus,
  InviteSummary,
  SpaceStatus
} from '@yuke/shared'

export type TenantStatement = {
  bind(...values: unknown[]): TenantStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type TenantDatabase = {
  prepare(query: string): TenantStatement
}

type InviteRow = {
  id: string
  space_id: string
  created_by_admin_id: string
  code: string
  label: string | null
  expires_at: number
  status: InviteStatus
  member_count: number
}

type InviteLookupRow = InviteRow & {
  space_name: string
  space_timezone: string
  space_status: SpaceStatus
}

type MemberRow = {
  membership_id: string
  nickname: string
  joined_at: number
  participant_count: number
  invited_by_admin_id: string
  invite_code_id: string
}

export type InviteLookup = {
  invite: InviteSummary
  space: {
    id: string
    name: string
    timezone: string
    status: SpaceStatus
  }
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function mapInvite(row: InviteRow): InviteSummary {
  return {
    id: row.id,
    spaceId: row.space_id,
    label: row.label,
    code: row.code,
    expiresAt: toIso(row.expires_at),
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    memberCount: row.member_count
  }
}

export async function spaceExists(
  db: TenantDatabase,
  spaceId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS present FROM spaces WHERE id = ? LIMIT 1')
    .bind(spaceId)
    .first<{ present: number }>()
  return row?.present === 1
}

export async function listInvites(
  db: TenantDatabase,
  spaceId: string
): Promise<InviteSummary[]> {
  const result = await db
    .prepare(`
      SELECT invite_codes.id,
             invite_codes.space_id,
             invite_codes.created_by_admin_id,
             invite_codes.code,
             invite_codes.label,
             invite_codes.expires_at,
             invite_codes.status,
             COUNT(space_memberships.id) AS member_count
      FROM invite_codes
      LEFT JOIN space_memberships
        ON space_memberships.invite_code_id = invite_codes.id
      WHERE invite_codes.space_id = ?
      GROUP BY invite_codes.id
      ORDER BY invite_codes.created_at DESC, invite_codes.id DESC
    `)
    .bind(spaceId)
    .all<InviteRow>()

  return (result.results ?? []).map(mapInvite)
}

export async function insertInvite(
  db: TenantDatabase,
  input: {
    id: string
    spaceId: string
    createdByAdminId: string
    code: string
    label: string | null
    expiresAt: number
    now: number
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO invite_codes (
        id,
        space_id,
        created_by_admin_id,
        code,
        label,
        expires_at,
        status,
        created_at,
        revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL)
    `)
    .bind(
      input.id,
      input.spaceId,
      input.createdByAdminId,
      input.code,
      input.label,
      input.expiresAt,
      input.now
    )
    .run()
}

export async function findInviteById(
  db: TenantDatabase,
  spaceId: string,
  inviteId: string
): Promise<InviteSummary | null> {
  const row = await db
    .prepare(`
      SELECT invite_codes.id,
             invite_codes.space_id,
             invite_codes.created_by_admin_id,
             invite_codes.code,
             invite_codes.label,
             invite_codes.expires_at,
             invite_codes.status,
             COUNT(space_memberships.id) AS member_count
      FROM invite_codes
      LEFT JOIN space_memberships
        ON space_memberships.invite_code_id = invite_codes.id
      WHERE invite_codes.space_id = ?
        AND invite_codes.id = ?
      GROUP BY invite_codes.id
      LIMIT 1
    `)
    .bind(spaceId, inviteId)
    .first<InviteRow>()

  return row ? mapInvite(row) : null
}

export async function findInviteByCode(
  db: TenantDatabase,
  code: string
): Promise<InviteLookup | null> {
  const row = await db
    .prepare(`
      SELECT invite_codes.id,
             invite_codes.space_id,
             invite_codes.created_by_admin_id,
             invite_codes.code,
             invite_codes.label,
             invite_codes.expires_at,
             invite_codes.status,
             0 AS member_count,
             spaces.name AS space_name,
             spaces.timezone AS space_timezone,
             spaces.status AS space_status
      FROM invite_codes
      JOIN spaces ON spaces.id = invite_codes.space_id
      WHERE invite_codes.code = ?
      LIMIT 1
    `)
    .bind(code)
    .first<InviteLookupRow>()

  if (!row) {
    return null
  }

  return {
    invite: mapInvite(row),
    space: {
      id: row.space_id,
      name: row.space_name,
      timezone: row.space_timezone,
      status: row.space_status
    }
  }
}

export async function revokeInvite(
  db: TenantDatabase,
  spaceId: string,
  inviteId: string,
  now: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE invite_codes
      SET status = 'revoked',
          revoked_at = COALESCE(revoked_at, ?)
      WHERE space_id = ?
        AND id = ?
    `)
    .bind(now, spaceId, inviteId)
    .run()
}

export async function listInviteMembers(
  db: TenantDatabase,
  spaceId: string,
  inviteId: string
): Promise<InviteMemberSummary[]> {
  const result = await db
    .prepare(`
      SELECT space_memberships.id AS membership_id,
             users.nickname,
             space_memberships.joined_at,
             COUNT(participants.id) AS participant_count,
             space_memberships.invited_by_admin_id,
             space_memberships.invite_code_id
      FROM space_memberships
      JOIN users ON users.id = space_memberships.user_id
      LEFT JOIN participants
        ON participants.membership_id = space_memberships.id
       AND participants.space_id = space_memberships.space_id
      WHERE space_memberships.space_id = ?
        AND space_memberships.invite_code_id = ?
      GROUP BY space_memberships.id
      ORDER BY space_memberships.joined_at ASC, space_memberships.id ASC
    `)
    .bind(spaceId, inviteId)
    .all<MemberRow>()

  return (result.results ?? []).map((row) => ({
    membershipId: row.membership_id,
    nickname: row.nickname,
    joinedAt: toIso(row.joined_at),
    participantCount: row.participant_count,
    invitedByAdminId: row.invited_by_admin_id,
    inviteCodeId: row.invite_code_id
  }))
}
