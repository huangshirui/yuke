import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../src/domains/identity/token'
import { authenticateAdminRequest } from '../src/lib/auth/index'
import {
  createSyntheticAccessKey,
  createSyntheticJwksFetch,
  signSyntheticAccessJwt
} from './helpers/access-jwt.mjs'
import { seedBookingFixture, NOW } from './helpers/d1-fixture.mjs'

const TEAM_DOMAIN = 'https://synthetic-team.cloudflareaccess.com'
const AUDIENCE = 'synthetic-access-audience'
const NOW_SECONDS = Math.floor(Date.now() / 1000)

async function adminTokenFor({
  adminId,
  subject,
  email,
  platformRole = 'super_admin',
  assignSpaceId = null,
  suffix
}) {
  if (platformRole !== 'super_admin') {
    await env.DB.prepare(`
      INSERT INTO admin_users
        (id, access_subject, email, platform_role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'none', 'active', ?, ?)
    `).bind(adminId, subject, email, NOW, NOW).run()

    if (assignSpaceId) {
      await env.DB.prepare(`
        INSERT INTO space_admins (space_id, admin_user_id, created_at)
        VALUES (?, ?, ?)
      `).bind(assignSpaceId, adminId, NOW).run()
    }
  }

  const key = await createSyntheticAccessKey(`catalog-${suffix}`)
  const token = await signSyntheticAccessJwt({
    ...key,
    issuer: TEAM_DOMAIN,
    audience: AUDIENCE,
    subject,
    email,
    nowSeconds: NOW_SECONDS
  })

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

  return token
}

function adminRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('cf-access-jwt-assertion', token)
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, { ...init, headers })
  )
}

function userRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, { ...init, headers })
  )
}

describe('Resource and Slot Type catalog', () => {
  it('supports Resource CRUD lifecycle and enforces Space Admin scope', async () => {
    const suffix = crypto.randomUUID()
    const a = await seedBookingFixture(`catalog-a-${suffix}`)
    const b = await seedBookingFixture(`catalog-b-${suffix}`)
    const regularId = `adm_catalog_regular_${suffix}`
    const regularSubject = `access-catalog-regular-${suffix}`
    const regularEmail = `catalog-regular-${suffix}@example.invalid`
    const token = await adminTokenFor({
      adminId: regularId,
      subject: regularSubject,
      email: regularEmail,
      platformRole: 'none',
      assignSpaceId: a.space,
      suffix: `regular-${suffix}`
    })

    const forbidden = await adminRequest(
      `/v1/admin/spaces/${b.space}/resources`,
      token
    )
    expect(forbidden.status).toBe(403)

    const create = await adminRequest(
      `/v1/admin/spaces/${a.space}/resources`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: '  Synthetic Catalog Resource  ',
          note: '  Synthetic note  '
        })
      }
    )
    expect(create.status).toBe(201)
    const resource = (await create.json()).data
    expect(resource).toMatchObject({
      spaceId: a.space,
      name: 'Synthetic Catalog Resource',
      note: 'Synthetic note',
      status: 'active'
    })

    const patch = await adminRequest(
      `/v1/admin/spaces/${a.space}/resources/${resource.id}`,
      token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Synthetic Renamed Resource', note: null })
      }
    )
    expect(patch.status).toBe(200)
    await expect(patch.json()).resolves.toMatchObject({
      data: { id: resource.id, name: 'Synthetic Renamed Resource', note: null }
    })

    const deactivate = await adminRequest(
      `/v1/admin/spaces/${a.space}/resources/${resource.id}/deactivate`,
      token,
      { method: 'POST' }
    )
    expect(deactivate.status).toBe(200)
    await expect(deactivate.json()).resolves.toMatchObject({
      data: { id: resource.id, status: 'inactive' }
    })

    const list = await adminRequest(
      `/v1/admin/spaces/${a.space}/resources`,
      token
    )
    expect(list.status).toBe(200)
    expect((await list.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: resource.id, status: 'inactive' })
      ])
    )

    const activate = await adminRequest(
      `/v1/admin/spaces/${a.space}/resources/${resource.id}/activate`,
      token,
      { method: 'POST' }
    )
    expect(activate.status).toBe(200)
  })

  it('keeps Slot Type names unique only within a Space and preserves inactive types', async () => {
    const suffix = crypto.randomUUID()
    const a = await seedBookingFixture(`catalog-type-a-${suffix}`)
    const b = await seedBookingFixture(`catalog-type-b-${suffix}`)

    const token = await adminTokenFor({
      adminId: a.admin,
      subject: `access-catalog-type-a-${suffix}`,
      email: `catalog-type-a-${suffix}@example.invalid`,
      suffix: `type-${suffix}`
    })

    const duplicate = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Synthetic Type catalog-type-a-${suffix}` })
      }
    )
    expect(duplicate.status).toBe(400)
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' }
    })

    const create = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Shared Synthetic Type' })
      }
    )
    expect(create.status).toBe(201)
    const slotType = (await create.json()).data

    const sameNameOtherSpace = await adminRequest(
      `/v1/admin/spaces/${b.space}/slot-types`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Shared Synthetic Type' })
      }
    )
    expect(sameNameOtherSpace.status).toBe(201)

    const deactivate = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types/${slotType.id}/deactivate`,
      token,
      { method: 'POST' }
    )
    expect(deactivate.status).toBe(200)

    const list = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types`,
      token
    )
    expect((await list.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: slotType.id, status: 'inactive' })
      ])
    )

    const rename = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types/${slotType.id}`,
      token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Synthetic Type' })
      }
    )
    expect(rename.status).toBe(200)

    const activate = await adminRequest(
      `/v1/admin/spaces/${a.space}/slot-types/${slotType.id}/activate`,
      token,
      { method: 'POST' }
    )
    expect(activate.status).toBe(200)
  })

  it('returns only active Resources to users with an active SpaceMembership', async () => {
    const suffix = crypto.randomUUID()
    const a = await seedBookingFixture(`catalog-user-a-${suffix}`)
    const b = await seedBookingFixture(`catalog-user-b-${suffix}`)

    await env.DB.prepare(`
      INSERT INTO resources (id, space_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, 'inactive', ?, ?)
    `).bind(
      `res_catalog_inactive_${suffix}`,
      a.space,
      'Synthetic Inactive Resource',
      NOW,
      NOW
    ).run()

    const issued = await issueUserToken(a.user, env.USER_TOKEN_SECRET)
    const allowed = await userRequest(
      `/v1/spaces/${a.space}/resources`,
      issued.accessToken
    )
    expect(allowed.status).toBe(200)
    const resources = (await allowed.json()).data
    expect(resources.every((resource) => resource.status === 'active')).toBe(true)
    expect(resources.map((resource) => resource.id)).toContain(a.resource)
    expect(resources.map((resource) => resource.id)).not.toContain(
      `res_catalog_inactive_${suffix}`
    )

    const denied = await userRequest(
      `/v1/spaces/${b.space}/resources`,
      issued.accessToken
    )
    expect(denied.status).toBe(403)
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: 'SPACE_ACCESS_DENIED' }
    })
  })

  it('returns NOT_FOUND for a missing Space instead of exposing a D1 foreign-key error', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`catalog-missing-${suffix}`)
    const token = await adminTokenFor({
      adminId: ids.admin,
      subject: `access-catalog-missing-${suffix}`,
      email: `catalog-missing-${suffix}@example.invalid`,
      suffix: `missing-${suffix}`
    })

    const response = await adminRequest(
      `/v1/admin/spaces/spc_missing_${suffix}/resources`,
      token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Synthetic Resource' })
      }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' }
    })
  })
})
