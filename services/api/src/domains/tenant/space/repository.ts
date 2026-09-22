import type {
  CutoffMinutes,
  SpaceAdminSummary,
  SpaceSettings,
  SpaceSummary
} from '@yuke/shared'
import type { AdminPrincipal } from '../../../lib/auth'

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type SpaceDatabase = {
  prepare(query: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<unknown[]>
}

type SpaceRow = {
  id: string
  name: string
  timezone: string
  status: SpaceSummary['status']
}

type SettingsRow = {
  booking_cutoff_minutes: CutoffMinutes
  cancellation_cutoff_minutes: CutoffMinutes
}

type AdminRow = {
  id: string
  display_name: string | null
  email: string
  platform_role: 'none' | 'super_admin'
  status: 'active' | 'inactive'
}

function mapSpace(row: SpaceRow): SpaceSummary {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    status: row.status
  }
}

function mapSettings(row: SettingsRow): SpaceSettings {
  return {
    bookingCutoffMinutes: row.booking_cutoff_minutes,
    cancellationCutoffMinutes: row.cancellation_cutoff_minutes
  }
}

function mapAdmin(row: AdminRow): SpaceAdminSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    platformRole: row.platform_role,
    status: row.status
  }
}

export async function listSpacesForAdmin(
  db: SpaceDatabase,
  principal: AdminPrincipal
): Promise<SpaceSummary[]> {
  const statement =
    principal.platformRole === 'super_admin'
      ? db.prepare(`
          SELECT id, name, timezone, status
          FROM spaces
          ORDER BY created_at ASC, id ASC
        `)
      : db.prepare(`
          SELECT spaces.id, spaces.name, spaces.timezone, spaces.status
          FROM space_admins
          JOIN spaces ON spaces.id = space_admins.space_id
          WHERE space_admins.admin_user_id = ?
          ORDER BY spaces.created_at ASC, spaces.id ASC
        `).bind(principal.id)

  const result = await statement.all<SpaceRow>()
  return (result.results ?? []).map(mapSpace)
}

export async function findSpaceById(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceSummary | null> {
  const row = await db
    .prepare(`
      SELECT id, name, timezone, status
      FROM spaces
      WHERE id = ?
      LIMIT 1
    `)
    .bind(spaceId)
    .first<SpaceRow>()

  return row ? mapSpace(row) : null
}

export async function createSpaceWithSettings(
  db: SpaceDatabase,
  input: {
    id: string
    name: string
    timezone: string
    settings: SpaceSettings
    now: number
  }
): Promise<void> {
  await db.batch([
    db.prepare(`
      INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).bind(input.id, input.name, input.timezone, input.now, input.now),
    db.prepare(`
      INSERT INTO space_settings (
        space_id,
        cancellation_cutoff_minutes,
        booking_cutoff_minutes,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      input.id,
      input.settings.cancellationCutoffMinutes,
      input.settings.bookingCutoffMinutes,
      input.now
    )
  ])
}

export async function updateSpace(
  db: SpaceDatabase,
  spaceId: string,
  patch: { name?: string; timezone?: string },
  now: number
): Promise<void> {
  if (patch.name !== undefined && patch.timezone !== undefined) {
    await db
      .prepare('UPDATE spaces SET name = ?, timezone = ?, updated_at = ? WHERE id = ?')
      .bind(patch.name, patch.timezone, now, spaceId)
      .run()
    return
  }

  if (patch.name !== undefined) {
    await db
      .prepare('UPDATE spaces SET name = ?, updated_at = ? WHERE id = ?')
      .bind(patch.name, now, spaceId)
      .run()
    return
  }

  if (patch.timezone !== undefined) {
    await db
      .prepare('UPDATE spaces SET timezone = ?, updated_at = ? WHERE id = ?')
      .bind(patch.timezone, now, spaceId)
      .run()
  }
}

export async function updateSpaceStatus(
  db: SpaceDatabase,
  spaceId: string,
  status: SpaceSummary['status'],
  now: number
): Promise<void> {
  await db
    .prepare('UPDATE spaces SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now, spaceId)
    .run()
}

export async function getSpaceSettings(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceSettings | null> {
  const row = await db
    .prepare(`
      SELECT booking_cutoff_minutes, cancellation_cutoff_minutes
      FROM space_settings
      WHERE space_id = ?
      LIMIT 1
    `)
    .bind(spaceId)
    .first<SettingsRow>()

  return row ? mapSettings(row) : null
}

export async function updateSpaceSettings(
  db: SpaceDatabase,
  spaceId: string,
  settings: SpaceSettings,
  now: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE space_settings
      SET booking_cutoff_minutes = ?,
          cancellation_cutoff_minutes = ?,
          updated_at = ?
      WHERE space_id = ?
    `)
    .bind(
      settings.bookingCutoffMinutes,
      settings.cancellationCutoffMinutes,
      now,
      spaceId
    )
    .run()
}

export async function listSpaceAdmins(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceAdminSummary[]> {
  const result = await db
    .prepare(`
      SELECT admin_users.id,
             admin_users.display_name,
             admin_users.email,
             admin_users.platform_role,
             admin_users.status
      FROM space_admins
      JOIN admin_users ON admin_users.id = space_admins.admin_user_id
      WHERE space_admins.space_id = ?
      ORDER BY space_admins.created_at ASC, admin_users.id ASC
    `)
    .bind(spaceId)
    .all<AdminRow>()

  return (result.results ?? []).map(mapAdmin)
}

export async function findAdminById(
  db: SpaceDatabase,
  adminUserId: string
): Promise<SpaceAdminSummary | null> {
  const row = await db
    .prepare(`
      SELECT id, display_name, email, platform_role, status
      FROM admin_users
      WHERE id = ?
      LIMIT 1
    `)
    .bind(adminUserId)
    .first<AdminRow>()

  return row ? mapAdmin(row) : null
}

export async function hasSpaceAdminAssignment(
  db: SpaceDatabase,
  spaceId: string,
  adminUserId: string
): Promise<boolean> {
  const row = await db
    .prepare(`
      SELECT 1 AS assigned
      FROM space_admins
      WHERE space_id = ? AND admin_user_id = ?
      LIMIT 1
    `)
    .bind(spaceId, adminUserId)
    .first<{ assigned: number }>()

  return row?.assigned === 1
}

export async function assignSpaceAdmin(
  db: SpaceDatabase,
  spaceId: string,
  adminUserId: string,
  now: number
): Promise<void> {
  await db
    .prepare(`
      INSERT OR IGNORE INTO space_admins (space_id, admin_user_id, created_at)
      VALUES (?, ?, ?)
    `)
    .bind(spaceId, adminUserId, now)
    .run()
}

export async function removeSpaceAdmin(
  db: SpaceDatabase,
  spaceId: string,
  adminUserId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM space_admins WHERE space_id = ? AND admin_user_id = ?')
    .bind(spaceId, adminUserId)
    .run()
}
