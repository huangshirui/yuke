import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { authenticateAdminRequest } from '../src/lib/auth/index'
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
  `).bind(id, subject, email, platformRole, status, NOW_MS, NOW_MS).run()
}

async function insertSpace({
  id,
  name,
  timezone = 'Asia/Shanghai',
  bookingCutoffMinutes = 60,
  cancellationCutoffMinutes = 240
}) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).bind(id, name, timezone, NOW_MS, NOW_MS),
    env.DB.prepare(`
      INSERT INTO space_settings
        (space_id, cancellation_cutoff_minutes, booking_cutoff_minutes, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, cancellationCutoffMinutes, bookingCutoffMinutes, NOW_MS)
  ])
}

async function adminToken({
  id,
  platformRole = 'none',
  suffix = crypto.randomUUID(),
  signingKey
}) {
  const subject = `access-${suffix}`
  const email = `${suffix}@example.invalid`
  await insertAdmin({ id, subject, email, platformRole })

  const key = signingKey ?? await createSyntheticAccessKey(`space-${suffix}`)
  const token = await signSyntheticAccessJwt({
    ...key,
    issuer: TEAM_DOMAIN,
    audience: AUDIENCE,
    subject,
    email,
    nowSeconds: NOW_SECONDS
  })

  // Prime the module-level JWK cache with a synthetic key. Runtime requests
  // then exercise the real Worker middleware without external network calls.
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

  return { token, subject, email }
}

function request(path, token, init = {}) {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('cf-access-jwt-assertion', token)
  }
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, {
      ...init,
      headers
    })
  )
}

async function json(response) {
  return response.json()
}

describe('Space admin backend', () => {
  it('protects admin Space routes with Cloudflare Access', async () => {
    const response = await request('/v1/admin/spaces')
    expect(response.status).toBe(401)
    await expect(json(response)).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' }
    })
  })

  it('lets Super Admin create a Space atomically with validated settings', async () => {
    const suffix = crypto.randomUUID()
    const superAdmin = await adminToken({
      id: `adm_super_create_${suffix}`,
      platformRole: 'super_admin',
      suffix: `super-create-${suffix}`
    })

    const invalidTimezone = await request('/v1/admin/spaces', superAdmin.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic Invalid Space',
        timezone: 'Not/A-Time-Zone',
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 240
      })
    })
    expect(invalidTimezone.status).toBe(400)

    const invalidCutoff = await request('/v1/admin/spaces', superAdmin.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic Invalid Cutoff',
        timezone: 'Asia/Shanghai',
        bookingCutoffMinutes: 120,
        cancellationCutoffMinutes: 240
      })
    })
    expect(invalidCutoff.status).toBe(400)

    const response = await request('/v1/admin/spaces', superAdmin.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic Created Space',
        timezone: 'Asia/Shanghai',
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: null
      })
    })

    expect(response.status).toBe(201)
    const body = await json(response)
    expect(body.data).toMatchObject({
      name: 'Synthetic Created Space',
      timezone: 'Asia/Shanghai',
      status: 'active',
      settings: {
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: null
      }
    })

    const row = await env.DB.prepare(`
      SELECT spaces.name,
             spaces.timezone,
             space_settings.booking_cutoff_minutes,
             space_settings.cancellation_cutoff_minutes
      FROM spaces
      JOIN space_settings ON space_settings.space_id = spaces.id
      WHERE spaces.id = ?
    `).bind(body.data.id).first()

    expect(row).toEqual({
      name: 'Synthetic Created Space',
      timezone: 'Asia/Shanghai',
      booking_cutoff_minutes: 60,
      cancellation_cutoff_minutes: null
    })
  })

  it('lists all Spaces for Super Admin but only assigned Spaces for regular Admin', async () => {
    const suffix = crypto.randomUUID()
    const signingKey = await createSyntheticAccessKey(`space-list-${suffix}`)
    const superAdmin = await adminToken({
      id: `adm_super_list_${suffix}`,
      platformRole: 'super_admin',
      suffix: `super-list-${suffix}`,
      signingKey
    })
    const regularId = `adm_regular_list_${suffix}`
    const regular = await adminToken({
      id: regularId,
      suffix: `regular-list-${suffix}`,
      signingKey
    })
    const assignedId = `spc_assigned_${suffix}`
    const otherId = `spc_other_${suffix}`

    await insertSpace({ id: assignedId, name: 'Synthetic Assigned Space' })
    await insertSpace({ id: otherId, name: 'Synthetic Other Space' })
    await env.DB.prepare(`
      INSERT INTO space_admins (space_id, admin_user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(assignedId, regularId, NOW_MS).run()

    const regularResponse = await request('/v1/admin/spaces', regular.token)
    expect(regularResponse.status).toBe(200)
    const regularBody = await json(regularResponse)
    expect(regularBody.data.map((space) => space.id)).toEqual([assignedId])

    const superResponse = await request('/v1/admin/spaces', superAdmin.token)
    expect(superResponse.status).toBe(200)
    const superBody = await json(superResponse)
    expect(superBody.data.map((space) => space.id)).toEqual(
      expect.arrayContaining([assignedId, otherId])
    )

    const forbiddenCreate = await request('/v1/admin/spaces', regular.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Synthetic Forbidden Space',
        timezone: 'Asia/Shanghai',
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 60
      })
    })
    expect(forbiddenCreate.status).toBe(403)
  })

  it('allows assigned Space Admins to manage only their Space settings', async () => {
    const suffix = crypto.randomUUID()
    const regularId = `adm_settings_${suffix}`
    const regular = await adminToken({
      id: regularId,
      suffix: `settings-${suffix}`
    })
    const assignedId = `spc_settings_assigned_${suffix}`
    const otherId = `spc_settings_other_${suffix}`

    await insertSpace({ id: assignedId, name: 'Synthetic Settings Assigned' })
    await insertSpace({ id: otherId, name: 'Synthetic Settings Other' })
    await env.DB.prepare(`
      INSERT INTO space_admins (space_id, admin_user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(assignedId, regularId, NOW_MS).run()

    const read = await request(
      `/v1/admin/spaces/${assignedId}/settings`,
      regular.token
    )
    expect(read.status).toBe(200)
    await expect(json(read)).resolves.toEqual({
      data: {
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 240
      }
    })

    const patch = await request(
      `/v1/admin/spaces/${assignedId}/settings`,
      regular.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingCutoffMinutes: null,
          cancellationCutoffMinutes: 15
        })
      }
    )
    expect(patch.status).toBe(200)
    await expect(json(patch)).resolves.toEqual({
      data: {
        bookingCutoffMinutes: null,
        cancellationCutoffMinutes: 15
      }
    })

    const invalid = await request(
      `/v1/admin/spaces/${assignedId}/settings`,
      regular.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingCutoffMinutes: 120 })
      }
    )
    expect(invalid.status).toBe(400)

    const forbidden = await request(
      `/v1/admin/spaces/${otherId}/settings`,
      regular.token
    )
    expect(forbidden.status).toBe(403)
  })

  it('lets Super Admin update lifecycle and manage Space Admin assignments', async () => {
    const suffix = crypto.randomUUID()
    const signingKey = await createSyntheticAccessKey(`space-manage-${suffix}`)
    const superAdmin = await adminToken({
      id: `adm_super_manage_${suffix}`,
      platformRole: 'super_admin',
      suffix: `super-manage-${suffix}`,
      signingKey
    })
    const targetAdminId = `adm_target_${suffix}`
    const target = await adminToken({
      id: targetAdminId,
      suffix: `target-${suffix}`,
      signingKey
    })
    const spaceId = `spc_manage_${suffix}`
    await insertSpace({ id: spaceId, name: 'Synthetic Managed Space' })

    const patch = await request(
      `/v1/admin/spaces/${spaceId}`,
      superAdmin.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Synthetic Renamed Space',
          timezone: 'Europe/Paris'
        })
      }
    )
    expect(patch.status).toBe(200)
    await expect(json(patch)).resolves.toMatchObject({
      data: {
        id: spaceId,
        name: 'Synthetic Renamed Space',
        timezone: 'Europe/Paris'
      }
    })

    const disable = await request(
      `/v1/admin/spaces/${spaceId}/disable`,
      superAdmin.token,
      { method: 'POST' }
    )
    expect(disable.status).toBe(200)
    await expect(json(disable)).resolves.toMatchObject({
      data: { status: 'disabled' }
    })

    const activate = await request(
      `/v1/admin/spaces/${spaceId}/activate`,
      superAdmin.token,
      { method: 'POST' }
    )
    expect(activate.status).toBe(200)
    await expect(json(activate)).resolves.toMatchObject({
      data: { status: 'active' }
    })

    const assign = await request(
      `/v1/admin/spaces/${spaceId}/admins`,
      superAdmin.token,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminUserId: targetAdminId })
      }
    )
    expect(assign.status).toBe(200)
    await expect(json(assign)).resolves.toMatchObject({
      data: {
        id: targetAdminId,
        email: target.email,
        platformRole: 'none',
        status: 'active'
      }
    })

    const targetSpaces = await request('/v1/admin/spaces', target.token)
    expect(targetSpaces.status).toBe(200)
    await expect(json(targetSpaces)).resolves.toMatchObject({
      data: [{ id: spaceId }]
    })

    const remove = await request(
      `/v1/admin/spaces/${spaceId}/admins/${targetAdminId}`,
      superAdmin.token,
      { method: 'DELETE' }
    )
    expect(remove.status).toBe(200)
    await expect(json(remove)).resolves.toEqual({ data: { removed: true } })

    const targetAfterRemove = await request('/v1/admin/spaces', target.token)
    await expect(json(targetAfterRemove)).resolves.toEqual({ data: [] })
  })
})
