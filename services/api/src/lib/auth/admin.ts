import { AppError } from '../errors'
import {
  CLOUDFLARE_ACCESS_JWT_HEADER,
  verifyCloudflareAccessJwt,
  type CloudflareAccessClaims,
  type CloudflareAccessVerificationOptions
} from './access'

export type AdminPlatformRole = 'none' | 'super_admin'
export type AdminIdentityStatus = 'pending' | 'bound'

export type AdminPrincipal = {
  id: string
  accessSubject: string
  email: string
  platformRole: AdminPlatformRole
}

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike
}

export type AdminAuthEnv = {
  DB: D1DatabaseLike
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  SUPER_ADMIN_EMAIL?: string
}

export type AdminRow = {
  id: string
  access_subject: string
  email: string
  platform_role: AdminPlatformRole
  status: 'active' | 'inactive'
  identity_status: AdminIdentityStatus
}

function forbidden(message = 'Admin access is not assigned'): AppError {
  return new AppError('SPACE_ACCESS_DENIED', message)
}

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase()
}

function configuredSuperAdminEmail(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const normalized = normalizeAdminEmail(value)
  return normalized || null
}

export async function findAdminByAccessSubject(
  db: D1DatabaseLike,
  accessSubject: string
): Promise<AdminRow | null> {
  return db
    .prepare(`
      SELECT id, access_subject, email, platform_role, status, identity_status
      FROM admin_users
      WHERE access_subject = ?
        AND identity_status = 'bound'
      LIMIT 1
    `)
    .bind(accessSubject)
    .first<AdminRow>()
}

export async function findAdminByEmail(
  db: D1DatabaseLike,
  email: string
): Promise<AdminRow | null> {
  return db
    .prepare(`
      SELECT id, access_subject, email, platform_role, status, identity_status
      FROM admin_users
      WHERE email = ?
      LIMIT 1
    `)
    .bind(normalizeAdminEmail(email))
    .first<AdminRow>()
}

export function toAdminPrincipal(row: AdminRow): AdminPrincipal {
  if (row.status !== 'active' || row.identity_status !== 'bound') {
    throw forbidden()
  }

  return {
    id: row.id,
    accessSubject: row.access_subject,
    email: row.email,
    platformRole: row.platform_role
  }
}

async function bindPendingAdmin(
  db: D1DatabaseLike,
  row: AdminRow,
  accessSubject: string,
  platformRole: AdminPlatformRole = row.platform_role
): Promise<AdminRow | null> {
  if (row.status !== 'active' || row.identity_status !== 'pending') {
    return null
  }

  await db
    .prepare(`
      UPDATE admin_users
      SET access_subject = ?,
          platform_role = ?,
          identity_status = 'bound',
          updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND identity_status = 'pending'
    `)
    .bind(accessSubject, platformRole, Date.now(), row.id)
    .run()

  return findAdminByAccessSubject(db, accessSubject)
}

async function ensureConfiguredSuperAdmin(
  db: D1DatabaseLike,
  claims: CloudflareAccessClaims,
  email: string
): Promise<AdminRow> {
  let row = await findAdminByEmail(db, email)

  if (!row) {
    const id = `adm_${crypto.randomUUID().replace(/-/g, '')}`
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
          VALUES (?, ?, ?, 'super_admin', 'active', 'bound', ?, ?)
        `)
        .bind(id, claims.sub, email, now, now)
        .run()
    } catch {
      // A concurrent first login may have created the same configured
      // Super Admin. Re-read the authoritative row before deciding.
    }

    row = await findAdminByEmail(db, email)
    if (!row) {
      throw new AppError('INTERNAL_ERROR', 'Unable to bootstrap Super Admin')
    }
  }

  if (row.status !== 'active') {
    throw forbidden()
  }

  if (row.identity_status === 'pending') {
    const bound = await bindPendingAdmin(db, row, claims.sub, 'super_admin')
    if (bound) {
      return bound
    }
    row = await findAdminByEmail(db, email)
  }

  if (!row) {
    throw forbidden()
  }

  if (row.identity_status !== 'bound' || row.access_subject !== claims.sub) {
    throw forbidden('Admin identity is already bound to another Access subject')
  }

  if (row.platform_role !== 'super_admin') {
    await db
      .prepare(`
        UPDATE admin_users
        SET platform_role = 'super_admin', updated_at = ?
        WHERE id = ?
      `)
      .bind(Date.now(), row.id)
      .run()
    row = (await findAdminByAccessSubject(db, claims.sub)) ?? row
  }

  return row
}

export async function resolveAdminPrincipal(
  db: D1DatabaseLike,
  claims: CloudflareAccessClaims,
  superAdminEmail?: string
): Promise<AdminPrincipal> {
  const direct = await findAdminByAccessSubject(db, claims.sub)
  if (direct) {
    return toAdminPrincipal(direct)
  }

  const email = claims.email ? normalizeAdminEmail(claims.email) : null
  if (!email) {
    throw forbidden('Cloudflare Access email is required for first-time admin binding')
  }

  const configuredSuper = configuredSuperAdminEmail(superAdminEmail)
  if (configuredSuper && email === configuredSuper) {
    return toAdminPrincipal(
      await ensureConfiguredSuperAdmin(db, claims, email)
    )
  }

  const pending = await findAdminByEmail(db, email)
  if (
    pending &&
    pending.status === 'active' &&
    pending.identity_status === 'pending' &&
    pending.platform_role === 'none'
  ) {
    const bound = await bindPendingAdmin(db, pending, claims.sub)
    if (bound) {
      return toAdminPrincipal(bound)
    }

    const raced = await findAdminByAccessSubject(db, claims.sub)
    if (raced) {
      return toAdminPrincipal(raced)
    }
  }

  throw forbidden()
}

export async function authenticateAdminRequest(
  request: Request,
  env: AdminAuthEnv,
  verificationOptions?: CloudflareAccessVerificationOptions
): Promise<AdminPrincipal> {
  const token = request.headers.get(CLOUDFLARE_ACCESS_JWT_HEADER)
  if (!token) {
    throw new AppError('UNAUTHENTICATED', 'Missing Cloudflare Access token')
  }

  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new AppError('INTERNAL_ERROR', 'Admin authentication is not configured')
  }

  const claims = await verifyCloudflareAccessJwt(
    token,
    {
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD
    },
    verificationOptions
  )

  return resolveAdminPrincipal(env.DB, claims, env.SUPER_ADMIN_EMAIL)
}

export function assertSuperAdmin(principal: AdminPrincipal): void {
  if (principal.platformRole !== 'super_admin') {
    throw forbidden('Super Admin access is required')
  }
}

export async function hasSpaceAdminAccess(
  db: D1DatabaseLike,
  principal: AdminPrincipal,
  spaceId: string
): Promise<boolean> {
  if (principal.platformRole === 'super_admin') {
    return true
  }

  const row = await db
    .prepare(`
      SELECT 1 AS allowed
      FROM space_admins
      WHERE space_id = ?
        AND admin_user_id = ?
      LIMIT 1
    `)
    .bind(spaceId, principal.id)
    .first<{ allowed: number }>()

  return row?.allowed === 1
}

export async function assertSpaceAdminAccess(
  db: D1DatabaseLike,
  principal: AdminPrincipal,
  spaceId: string
): Promise<void> {
  if (!(await hasSpaceAdminAccess(db, principal, spaceId))) {
    throw forbidden('Space Admin access is required')
  }
}
