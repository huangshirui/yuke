import type {
  AdminMemberDetail,
  AdminMemberSummary,
  AdminParticipantDetail,
  SpaceMembershipSummary,
  SpaceSummary
} from '@yuke/shared'
import type { TenantDatabase } from '../invite/repository'

type MembershipRow = {
  id: string
  space_id: string
  user_id: string
  invited_by_admin_id: string
  invited_by_admin_display_name: string | null
  invited_by_admin_email: string
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
    invitedByAdminDisplayName: row.invited_by_admin_display_name,
    invitedByAdminEmail: row.invited_by_admin_email,
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


export type AdminMemberFilters = {
  invitedByAdminId?: string
  inviteCodeId?: string
}

type AdminMemberRow = {
  membership_id: string
  nickname: string
  joined_at: number
  participant_count: number
  invited_by_admin_id: string
  invite_code_id: string
  status: 'active' | 'inactive'
  admin_note: string | null
}

type AdminParticipantRow = {
  id: string
  name: string
  birth_month: string
  status: 'active' | 'inactive'
  user_note: string | null
  admin_note: string | null
}

function mapAdminMember(row: AdminMemberRow): AdminMemberSummary {
  return {
    membershipId: row.membership_id,
    nickname: row.nickname,
    joinedAt: new Date(row.joined_at).toISOString(),
    participantCount: row.participant_count,
    invitedByAdminId: row.invited_by_admin_id,
    inviteCodeId: row.invite_code_id,
    status: row.status,
    adminNote: row.admin_note
  }
}

function mapAdminParticipant(row: AdminParticipantRow): AdminParticipantDetail {
  return {
    id: row.id,
    name: row.name,
    birthMonth: row.birth_month,
    status: row.status,
    userNote: row.user_note,
    adminNote: row.admin_note
  }
}

function adminMemberWhere(filters: AdminMemberFilters): {
  clauses: string[]
  values: unknown[]
} {
  const clauses = ['space_memberships.space_id = ?']
  const values: unknown[] = []

  if (filters.invitedByAdminId) {
    clauses.push('space_memberships.invited_by_admin_id = ?')
    values.push(filters.invitedByAdminId)
  }
  if (filters.inviteCodeId) {
    clauses.push('space_memberships.invite_code_id = ?')
    values.push(filters.inviteCodeId)
  }

  return { clauses, values }
}

export async function adminMembershipSpaceExists(
  db: TenantDatabase,
  spaceId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS present FROM spaces WHERE id = ? LIMIT 1')
    .bind(spaceId)
    .first<{ present: number }>()
  return row?.present === 1
}

export async function listAdminMembers(
  db: TenantDatabase,
  spaceId: string,
  filters: AdminMemberFilters = {}
): Promise<AdminMemberSummary[]> {
  const where = adminMemberWhere(filters)
  const result = await db
    .prepare(`
      SELECT space_memberships.id AS membership_id,
             users.nickname,
             space_memberships.joined_at,
             COUNT(participants.id) AS participant_count,
             space_memberships.invited_by_admin_id,
             invited_admins.display_name AS invited_by_admin_display_name,
             invited_admins.email AS invited_by_admin_email,
             space_memberships.invite_code_id,
             space_memberships.status,
             space_memberships.admin_note
      FROM space_memberships
      JOIN users ON users.id = space_memberships.user_id
      JOIN admin_users AS invited_admins
        ON invited_admins.id = space_memberships.invited_by_admin_id
      LEFT JOIN participants
        ON participants.membership_id = space_memberships.id
       AND participants.space_id = space_memberships.space_id
      WHERE ${where.clauses.join('\n        AND ')}
      GROUP BY space_memberships.id
      ORDER BY space_memberships.joined_at DESC, space_memberships.id DESC
    `)
    .bind(spaceId, ...where.values)
    .all<AdminMemberRow>()

  return (result.results ?? []).map(mapAdminMember)
}

export async function findAdminMember(
  db: TenantDatabase,
  spaceId: string,
  membershipId: string
): Promise<AdminMemberDetail | null> {
  const row = await db
    .prepare(`
      SELECT space_memberships.id AS membership_id,
             users.nickname,
             space_memberships.joined_at,
             COUNT(DISTINCT participants.id) AS participant_count,
             space_memberships.invited_by_admin_id,
             invited_admins.display_name AS invited_by_admin_display_name,
             invited_admins.email AS invited_by_admin_email,
             space_memberships.invite_code_id,
             space_memberships.status,
             space_memberships.admin_note
      FROM space_memberships
      JOIN users ON users.id = space_memberships.user_id
      JOIN admin_users AS invited_admins
        ON invited_admins.id = space_memberships.invited_by_admin_id
      LEFT JOIN participants
        ON participants.membership_id = space_memberships.id
       AND participants.space_id = space_memberships.space_id
      WHERE space_memberships.space_id = ?
        AND space_memberships.id = ?
      GROUP BY space_memberships.id
      LIMIT 1
    `)
    .bind(spaceId, membershipId)
    .first<AdminMemberRow>()

  if (!row) return null

  const [participantsResult, bookingCountRow] = await Promise.all([
    db
      .prepare(`
        SELECT id,
               name,
               birth_month,
               status,
               user_note,
               admin_note
        FROM participants
        WHERE space_id = ?
          AND membership_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .bind(spaceId, membershipId)
      .all<AdminParticipantRow>(),
    db
      .prepare(`
        SELECT COUNT(*) AS booking_count
        FROM bookings
        WHERE space_id = ?
          AND membership_id = ?
      `)
      .bind(spaceId, membershipId)
      .first<{ booking_count: number }>()
  ])

  return {
    ...mapAdminMember(row),
    participants: (participantsResult.results ?? []).map(mapAdminParticipant),
    bookingCount: bookingCountRow?.booking_count ?? 0
  }
}

export async function updateAdminMemberNote(
  db: TenantDatabase,
  input: {
    spaceId: string
    membershipId: string
    adminNote: string | null
    now: number
  }
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE space_memberships
      SET admin_note = ?,
          updated_at = ?
      WHERE space_id = ?
        AND id = ?
    `)
    .bind(input.adminNote, input.now, input.spaceId, input.membershipId)
    .run() as { meta?: { changes?: number } }

  return (result.meta?.changes ?? 0) > 0
}

export async function updateAdminParticipantNote(
  db: TenantDatabase,
  input: {
    spaceId: string
    participantId: string
    adminNote: string | null
    now: number
  }
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE participants
      SET admin_note = ?,
          updated_at = ?
      WHERE space_id = ?
        AND id = ?
    `)
    .bind(input.adminNote, input.now, input.spaceId, input.participantId)
    .run() as { meta?: { changes?: number } }

  return (result.meta?.changes ?? 0) > 0
}
