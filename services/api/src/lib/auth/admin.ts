import { AppError } from '../errors'
import {
  CLOUDFLARE_ACCESS_JWT_HEADER,
  verifyCloudflareAccessJwt,
  type CloudflareAccessClaims,
  type CloudflareAccessVerificationOptions
} from './access'

export type AdminPlatformRole = 'none' | 'super_admin'

export type AdminPrincipal = {
  id: string
  accessSubject: string
  email: string
  platformRole: AdminPlatformRole
}

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike
}

export type AdminAuthEnv = {
  DB: D1DatabaseLike
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
}

type AdminRow = {
  id: string
  access_subject: string
  email: string
  platform_role: AdminPlatformRole
  status: 'active' | 'inactive'
}

function forbidden(message = 'Admin access is not assigned'): AppError {
  return new AppError('SPACE_ACCESS_DENIED', message)
}

export async function findAdminByAccessSubject(
  db: D1DatabaseLike,
  accessSubject: string
): Promise<AdminRow | null> {
  return db
    .prepare(`
      SELECT id, access_subject, email, platform_role, status
      FROM admin_users
      WHERE access_subject = ?
      LIMIT 1
    `)
    .bind(accessSubject)
    .first<AdminRow>()
}

export function toAdminPrincipal(row: AdminRow): AdminPrincipal {
  if (row.status !== 'active') {
    throw forbidden()
  }

  return {
    id: row.id,
    accessSubject: row.access_subject,
    email: row.email,
    platformRole: row.platform_role
  }
}

export async function resolveAdminPrincipal(
  db: D1DatabaseLike,
  claims: CloudflareAccessClaims
): Promise<AdminPrincipal> {
  const row = await findAdminByAccessSubject(db, claims.sub)
  if (!row) {
    throw forbidden()
  }
  return toAdminPrincipal(row)
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

  return resolveAdminPrincipal(env.DB, claims)
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
