import type {
  AdminIdentityStatus,
  AdminUserSummary
} from '@yuke/shared'
import type {
  AdminPlatformRole,
  D1DatabaseLike
} from '../../lib/auth/admin'
import {
  findAdminByEmail,
  normalizeAdminEmail
} from '../../lib/auth/admin'

type AdminUserRow = {
  id: string
  email: string
  display_name: string | null
  platform_role: AdminPlatformRole
  status: 'active' | 'inactive'
  identity_status: AdminIdentityStatus
}

function mapAdmin(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    platformRole: row.platform_role,
    status: row.status,
    identityStatus: row.identity_status
  }
}

function rowFromAuth(row: Awaited<ReturnType<typeof findAdminByEmail>>): AdminUserRow | null {
  if (!row) {
    return null
  }
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    platform_role: row.platform_role,
    status: row.status,
    identity_status: row.identity_status
  }
}

export async function listAdminUsers(
  db: D1DatabaseLike
): Promise<AdminUserSummary[]> {
  const result = await db
    .prepare(`
      SELECT id, email, display_name, platform_role, status, identity_status
      FROM admin_users
      ORDER BY created_at ASC, id ASC
    `)
    .all<AdminUserRow>()

  return (result.results ?? []).map(mapAdmin)
}

export async function provisionAdminUser(
  db: D1DatabaseLike,
  emailInput: string,
  displayNameInput?: string
): Promise<AdminUserSummary> {
  const email = normalizeAdminEmail(emailInput)
  const displayName = displayNameInput?.trim() || null
  const existing = rowFromAuth(await findAdminByEmail(db, email))
  if (existing) {
    if (displayName && displayName !== existing.display_name) {
      await db.prepare(`UPDATE admin_users SET display_name = ?, updated_at = ? WHERE id = ?`)
        .bind(displayName, Date.now(), existing.id)
        .run()
      return mapAdmin({ ...existing, display_name: displayName })
    }
    return mapAdmin(existing)
  }

  const id = `adm_${crypto.randomUUID().replace(/-/g, '')}`
  const pendingSubject = `pending:${id}`
  const now = Date.now()

  try {
    await db
      .prepare(`
        INSERT INTO admin_users (
          id,
          access_subject,
          email,
          display_name,
          platform_role,
          status,
          identity_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, 'none', 'active', 'pending', ?, ?)
      `)
      .bind(id, pendingSubject, email, displayName, now, now)
      .run()
  } catch {
    const raced = rowFromAuth(await findAdminByEmail(db, email))
    if (raced) {
      return mapAdmin(raced)
    }
    throw new Error('Unable to provision AdminUser')
  }

  const created = rowFromAuth(await findAdminByEmail(db, email))
  if (!created) {
    throw new Error('Unable to read provisioned AdminUser')
  }
  return mapAdmin(created)
}

export async function updateAdminUserDisplayName(
  db: D1DatabaseLike,
  adminUserId: string,
  displayNameInput: string
): Promise<AdminUserSummary | null> {
  const displayName = displayNameInput.trim()
  await db.prepare(`UPDATE admin_users SET display_name = ?, updated_at = ? WHERE id = ?`)
    .bind(displayName, Date.now(), adminUserId)
    .run()
  const row = await db.prepare(`
    SELECT id, email, display_name, platform_role, status, identity_status
    FROM admin_users
    WHERE id = ?
    LIMIT 1
  `).bind(adminUserId).first<AdminUserRow>()
  return row ? mapAdmin(row) : null
}
