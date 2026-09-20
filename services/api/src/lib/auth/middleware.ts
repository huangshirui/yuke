import { AppError } from '../errors'
import type { Middleware, RouteContext } from '../router'
import {
  assertSpaceAdminAccess,
  assertSuperAdmin,
  authenticateAdminRequest,
  type AdminAuthEnv,
  type AdminPrincipal
} from './admin'

const principalsByContext = new WeakMap<object, AdminPrincipal>()

export function getAdminPrincipal(context: object): AdminPrincipal {
  const principal = principalsByContext.get(context)
  if (!principal) {
    throw new AppError('UNAUTHENTICATED', 'Admin authentication is required')
  }
  return principal
}

export const requireAdminAccess: Middleware<AdminAuthEnv> = async (context, next) => {
  const principal = await authenticateAdminRequest(context.request, context.env)
  principalsByContext.set(context, principal)
  return next()
}

export const requireSuperAdmin: Middleware<AdminAuthEnv> = async (context, next) => {
  assertSuperAdmin(getAdminPrincipal(context))
  return next()
}

export function requireSpaceAdmin(
  paramName = 'spaceId'
): Middleware<AdminAuthEnv> {
  return async (context: RouteContext<AdminAuthEnv>, next) => {
    const spaceId = context.params[paramName]
    if (!spaceId) {
      throw new AppError('INTERNAL_ERROR', `Missing route parameter: ${paramName}`)
    }

    await assertSpaceAdminAccess(
      context.env.DB,
      getAdminPrincipal(context),
      spaceId
    )

    return next()
  }
}
