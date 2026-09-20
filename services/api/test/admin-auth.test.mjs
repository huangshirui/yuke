import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { ok } from '../src/lib/http'
import { Router } from '../src/lib/router'
import {
  assertSpaceAdminAccess,
  assertSuperAdmin,
  authenticateAdminRequest,
  getAdminPrincipal,
  requireAdminAccess,
  requireSpaceAdmin,
  requireSuperAdmin,
  verifyCloudflareAccessJwt
} from '../src/lib/auth/index'
import {
  createSyntheticAccessKey,
  createSyntheticJwksFetch,
  signSyntheticAccessJwt
} from './helpers/access-jwt.mjs'

const TEAM_DOMAIN = 'https://synthetic-team.cloudflareaccess.com'
const AUDIENCE = 'synthetic-access-audience'
const NOW_SECONDS = Math.floor(Date.now() / 1000)
const NOW_MS = NOW_SECONDS * 1000

async function insertAdmin({
  id,
  subject,
  email,
  platformRole = 'none',
  status = 'active'
}) {
  await env.DB.prepare(`
    INSERT INTO admin_users
      (id, access_subject, email, platform_role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(id, subject, email, platformRole, status, NOW_MS, NOW_MS)
    .run()
}

async function insertSpace(id) {
  await env.DB.prepare(`
    INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `)
    .bind(id, `Synthetic Space ${id}`, 'Asia/Shanghai', NOW_MS, NOW_MS)
    .run()
}

describe('Cloudflare Access JWT verification', () => {
  it('verifies RS256 signature, issuer, audience and time claims', async () => {
    const key = await createSyntheticAccessKey('verify-valid')
    const token = await signSyntheticAccessJwt({
      ...key,
      issuer: TEAM_DOMAIN,
      audience: AUDIENCE,
      subject: 'access-subject-valid',
      nowSeconds: NOW_SECONDS
    })

    const claims = await verifyCloudflareAccessJwt(
      token,
      {
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE
      },
      {
        fetch: createSyntheticJwksFetch(key.publicJwk),
        nowSeconds: NOW_SECONDS
      }
    )

    expect(claims.sub).toBe('access-subject-valid')
    expect(claims.email).toBe('synthetic-admin@example.invalid')
  })

  it('rejects a validly signed token for another Access application', async () => {
    const key = await createSyntheticAccessKey('verify-aud')
    const token = await signSyntheticAccessJwt({
      ...key,
      issuer: TEAM_DOMAIN,
      audience: 'another-synthetic-audience',
      subject: 'access-subject-aud',
      nowSeconds: NOW_SECONDS
    })

    await expect(
      verifyCloudflareAccessJwt(
        token,
        {
          teamDomain: TEAM_DOMAIN,
          audience: AUDIENCE
        },
        {
          fetch: createSyntheticJwksFetch(key.publicJwk),
          nowSeconds: NOW_SECONDS
        }
      )
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401
    })
  })
})

describe('Admin principal mapping and RBAC', () => {
  it('maps Access sub to a pre-provisioned active AdminUser', async () => {
    const suffix = crypto.randomUUID()
    const subject = `access-${suffix}`
    const adminId = `adm_${suffix}`
    const email = `${suffix}@example.invalid`
    await insertAdmin({
      id: adminId,
      subject,
      email,
      platformRole: 'super_admin'
    })

    const key = await createSyntheticAccessKey(`map-${suffix}`)
    const token = await signSyntheticAccessJwt({
      ...key,
      issuer: TEAM_DOMAIN,
      audience: AUDIENCE,
      subject,
      email,
      nowSeconds: NOW_SECONDS
    })

    const principal = await authenticateAdminRequest(
      new Request('https://example.invalid/v1/admin/ping', {
        headers: {
          'cf-access-jwt-assertion': token
        }
      }),
      {
        DB: env.DB,
        CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        CF_ACCESS_AUD: AUDIENCE
      },
      {
        fetch: createSyntheticJwksFetch(key.publicJwk),
        nowSeconds: NOW_SECONDS
      }
    )

    expect(principal).toEqual({
      id: adminId,
      accessSubject: subject,
      email,
      platformRole: 'super_admin'
    })
  })

  it('returns 403 semantics for a valid Access identity without an AdminUser', async () => {
    const suffix = crypto.randomUUID()
    const key = await createSyntheticAccessKey(`unassigned-${suffix}`)
    const token = await signSyntheticAccessJwt({
      ...key,
      issuer: TEAM_DOMAIN,
      audience: AUDIENCE,
      subject: `unassigned-${suffix}`,
      nowSeconds: NOW_SECONDS
    })

    await expect(
      authenticateAdminRequest(
        new Request('https://example.invalid/v1/admin/ping', {
          headers: {
            'cf-access-jwt-assertion': token
          }
        }),
        {
          DB: env.DB,
          CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
          CF_ACCESS_AUD: AUDIENCE
        },
        {
          fetch: createSyntheticJwksFetch(key.publicJwk),
          nowSeconds: NOW_SECONDS
        }
      )
    ).rejects.toMatchObject({
      code: 'SPACE_ACCESS_DENIED',
      status: 403
    })
  })

  it('allows assigned Space Admins and lets Super Admins bypass Space assignment', async () => {
    const suffix = crypto.randomUUID()
    const assignedSpace = `spc_assigned_${suffix}`
    const otherSpace = `spc_other_${suffix}`
    const regularAdmin = {
      id: `adm_regular_${suffix}`,
      accessSubject: `access-regular-${suffix}`,
      email: `regular-${suffix}@example.invalid`,
      platformRole: 'none'
    }
    const superAdmin = {
      id: `adm_super_${suffix}`,
      accessSubject: `access-super-${suffix}`,
      email: `super-${suffix}@example.invalid`,
      platformRole: 'super_admin'
    }

    await insertAdmin({
      id: regularAdmin.id,
      subject: regularAdmin.accessSubject,
      email: regularAdmin.email
    })
    await insertAdmin({
      id: superAdmin.id,
      subject: superAdmin.accessSubject,
      email: superAdmin.email,
      platformRole: 'super_admin'
    })
    await insertSpace(assignedSpace)
    await insertSpace(otherSpace)
    await env.DB.prepare(`
      INSERT INTO space_admins (space_id, admin_user_id, created_at)
      VALUES (?, ?, ?)
    `)
      .bind(assignedSpace, regularAdmin.id, NOW_MS)
      .run()

    await expect(
      assertSpaceAdminAccess(env.DB, regularAdmin, assignedSpace)
    ).resolves.toBeUndefined()

    await expect(
      assertSpaceAdminAccess(env.DB, regularAdmin, otherSpace)
    ).rejects.toMatchObject({ code: 'SPACE_ACCESS_DENIED' })

    await expect(
      assertSpaceAdminAccess(env.DB, superAdmin, otherSpace)
    ).resolves.toBeUndefined()

    expect(() => assertSuperAdmin(superAdmin)).not.toThrow()
    expect(() => assertSuperAdmin(regularAdmin)).toThrowError(
      expect.objectContaining({ code: 'SPACE_ACCESS_DENIED' })
    )
  })

  it('composes authentication and authorization as Router middleware', async () => {
    const suffix = crypto.randomUUID()
    const subject = `access-router-${suffix}`
    const adminId = `adm_router_${suffix}`
    const email = `router-${suffix}@example.invalid`
    const spaceId = `spc_router_${suffix}`
    await insertAdmin({
      id: adminId,
      subject,
      email,
      platformRole: 'super_admin'
    })
    await insertSpace(spaceId)

    const key = await createSyntheticAccessKey(`router-${suffix}`)
    const token = await signSyntheticAccessJwt({
      ...key,
      issuer: TEAM_DOMAIN,
      audience: AUDIENCE,
      subject,
      email,
      nowSeconds: NOW_SECONDS
    })

    // Prime the same JWKS cache path with a synthetic key so middleware never
    // needs a real network request during this public-repository test.
    await authenticateAdminRequest(
      new Request('https://example.invalid/v1/admin/prime', {
        headers: { 'cf-access-jwt-assertion': token }
      }),
      {
        DB: env.DB,
        CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
        CF_ACCESS_AUD: AUDIENCE
      },
      {
        fetch: createSyntheticJwksFetch(key.publicJwk),
        nowSeconds: NOW_SECONDS
      }
    )

    const router = new Router()
    router.get(
      '/v1/admin/super',
      (context) => ok({ adminId: getAdminPrincipal(context).id }),
      [requireAdminAccess, requireSuperAdmin]
    )
    router.get(
      '/v1/admin/spaces/:spaceId/ping',
      (context) => ok({ adminId: getAdminPrincipal(context).id }),
      [requireAdminAccess, requireSpaceAdmin()]
    )

    const runtimeEnv = {
      DB: env.DB,
      CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      CF_ACCESS_AUD: AUDIENCE
    }

    const superResponse = await router.handle({
      request: new Request('https://example.invalid/v1/admin/super', {
        headers: { 'cf-access-jwt-assertion': token }
      }),
      env: runtimeEnv
    })
    expect(superResponse.status).toBe(200)
    await expect(superResponse.json()).resolves.toEqual({
      data: { adminId }
    })

    const spaceResponse = await router.handle({
      request: new Request(
        `https://example.invalid/v1/admin/spaces/${spaceId}/ping`,
        {
          headers: { 'cf-access-jwt-assertion': token }
        }
      ),
      env: runtimeEnv
    })
    expect(spaceResponse.status).toBe(200)

    const missingTokenResponse = await router.handle({
      request: new Request('https://example.invalid/v1/admin/super'),
      env: runtimeEnv
    })
    expect(missingTokenResponse.status).toBe(401)
    await expect(missingTokenResponse.json()).resolves.toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing Cloudflare Access token'
      }
    })
  })
})
