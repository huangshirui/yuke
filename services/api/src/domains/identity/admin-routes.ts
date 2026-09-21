import type {
  CreateAdminUserInput
} from '@yuke/shared'
import type { IdentityEnv } from './env'
import {
  getAdminPrincipal,
  requireAdminAccess,
  requireSuperAdmin,
  type AdminAuthEnv
} from '../../lib/auth'
import { ok } from '../../lib/http'
import type { Router } from '../../lib/router'
import {
  expectObject,
  parseJsonBody,
  requireString
} from '../../lib/validation'
import { ValidationError } from '../../lib/errors'
import {
  listAdminUsers,
  provisionAdminUser
} from './admin-provisioning'

function parseEmail(value: unknown): CreateAdminUserInput {
  const body = expectObject(value)
  const email = requireString(body, 'email', { maxLength: 320 }).toLowerCase()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('email must be a valid email address', { path: 'email' })
  }

  return { email }
}

export type AdminProvisioningEnv = IdentityEnv & AdminAuthEnv

export function registerAdminProvisioningRoutes(
  app: Router<AdminProvisioningEnv>
): void {
  app.get(
    '/v1/admin/me',
    async (context) => {
      const principal = getAdminPrincipal(context)
      return ok({
        id: principal.id,
        email: principal.email,
        platformRole: principal.platformRole
      })
    },
    [requireAdminAccess]
  )

  app.get(
    '/v1/admin/admin-users',
    async ({ env }) => ok(await listAdminUsers(env.DB)),
    [requireAdminAccess, requireSuperAdmin]
  )

  app.post(
    '/v1/admin/admin-users',
    async ({ request, env }) => {
      const input = await parseJsonBody(request, parseEmail)
      return ok(await provisionAdminUser(env.DB, input.email))
    },
    [requireAdminAccess, requireSuperAdmin]
  )
}
