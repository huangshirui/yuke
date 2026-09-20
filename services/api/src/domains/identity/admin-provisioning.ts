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
  platform_role: AdminPlatformRole
  status: 'active' | 'inactive'
  identity_status: AdminIdentityStatus
}

function mapAdmin(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
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
      SELECT id, email, platform_role, status, identity_status
      FROM admin_users
      ORDER BY created_at ASC, id ASC
    `)
    .all<AdminUserRow>()

  return (result.results ?? []).map(mapAdmin)
}

export async function provisionAdminUser(
  db: D1DatabaseLike,
  emailInput: string
): Promise<AdminUserSummary> {
  const email = normalizeAdminEmail(emailInput)
  const existing = rowFromAuth(await findAdminByEmail(db, email))
  if (existing) {
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
          platform_role,
          status,
          identity_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'none', 'active', 'pending', ?, ?)
      `)
      .bind(id, pendingSubject, email, now, now)
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
