import type {
  CreateAdminUserInput
} from '@yuke/shared'
import {
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

export function registerAdminProvisioningRoutes(
  app: Router<AdminAuthEnv>
): void {
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
