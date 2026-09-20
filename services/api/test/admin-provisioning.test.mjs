import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { authenticateAdminRequest } from '../src/lib/auth/index'
import {
  createSyntheticAccessKey,
  createSyntheticJwksFetch,
  signSyntheticAccessJwt
} from './helpers/access-jwt.mjs'

const TEAM_DOMAIN = 'https://synthetic-team.cloudflareaccess.com'
const AUDIENCE = 'synthetic-access-audience'
const SUPER_EMAIL = 'configured-super@example.invalid'
const NOW_SECONDS = Math.floor(Date.now() / 1000)
const NOW_MS = NOW_SECONDS * 1000

async function tokenFor({ email, subject, key }) {
  const signingKey = key ?? await createSyntheticAccessKey(`provision-${crypto.randomUUID()}`)
  const token = await signSyntheticAccessJwt({
    ...signingKey,
    issuer: TEAM_DOMAIN,
    audience: AUDIENCE,
    subject,
    email,
    nowSeconds: NOW_SECONDS
  })
  return { token, key: signingKey }
}

function authEnv() {
  return {
    DB: env.DB,
    CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    CF_ACCESS_AUD: AUDIENCE,
    SUPER_ADMIN_EMAIL: SUPER_EMAIL
  }
}

async function authenticate(token, key) {
  return authenticateAdminRequest(
    new Request('https://example.invalid/v1/admin/bootstrap', {
      headers: { 'cf-access-jwt-assertion': token }
    }),
    authEnv(),
    {
      fetch: createSyntheticJwksFetch(key.publicJwk),
      nowSeconds: NOW_SECONDS
    }
  )
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

describe('AdminUser bootstrap and provisioning', () => {
  beforeEach(async () => {
    await env.DB.prepare(
      'DELETE FROM admin_users WHERE email = ?'
    ).bind(SUPER_EMAIL).run()
  })

  it('bootstraps the configured Super Admin on first Access login', async () => {
    const suffix = crypto.randomUUID()
    const subject = `super-sub-${suffix}`
    const { token, key } = await tokenFor({
      email: SUPER_EMAIL,
      subject
    })

    const principal = await authenticate(token, key)

    expect(principal).toMatchObject({
      accessSubject: subject,
      email: SUPER_EMAIL,
      platformRole: 'super_admin'
    })

    const row = await env.DB.prepare(`
      SELECT id, access_subject, email, platform_role, status, identity_status
      FROM admin_users
      WHERE email = ?
    `).bind(SUPER_EMAIL).first()

    expect(row).toMatchObject({
      id: principal.id,
      access_subject: subject,
      email: SUPER_EMAIL,
      platform_role: 'super_admin',
      status: 'active',
      identity_status: 'bound'
    })

    const again = await authenticate(token, key)
    expect(again.id).toBe(principal.id)
  })

  it('lets Super Admin provision an email and binds that same AdminUser on first login', async () => {
    const suffix = crypto.randomUUID()
    const superSubject = `super-route-${suffix}`
    const sharedKey = await createSyntheticAccessKey(`provision-route-${suffix}`)
    const superToken = await tokenFor({
      email: SUPER_EMAIL,
      subject: superSubject,
      key: sharedKey
    })

    // Bootstrap the configured Super Admin and prime the JWKS cache used by
    // real Worker middleware requests below.
    await authenticate(superToken.token, sharedKey)

    const adminEmail = `future-${suffix}@example.invalid`
    const createResponse = await request('/v1/admin/admin-users', superToken.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: adminEmail })
    })

    expect(createResponse.status).toBe(200)
    const created = await createResponse.json()
    expect(created.data).toMatchObject({
      email: adminEmail,
      platformRole: 'none',
      status: 'active',
      identityStatus: 'pending'
    })

    const pendingId = created.data.id
    const pendingRow = await env.DB.prepare(`
      SELECT access_subject, identity_status
      FROM admin_users
      WHERE id = ?
    `).bind(pendingId).first()
    expect(pendingRow).toEqual({
      access_subject: `pending:${pendingId}`,
      identity_status: 'pending'
    })

    const regularSubject = `regular-sub-${suffix}`
    const regularToken = await tokenFor({
      email: adminEmail.toUpperCase(),
      subject: regularSubject,
      key: sharedKey
    })

    const principal = await authenticate(regularToken.token, sharedKey)
    expect(principal).toEqual({
      id: pendingId,
      accessSubject: regularSubject,
      email: adminEmail,
      platformRole: 'none'
    })

    const boundRow = await env.DB.prepare(`
      SELECT access_subject, identity_status
      FROM admin_users
      WHERE id = ?
    `).bind(pendingId).first()
    expect(boundRow).toEqual({
      access_subject: regularSubject,
      identity_status: 'bound'
    })

    const listResponse = await request('/v1/admin/admin-users', superToken.token)
    expect(listResponse.status).toBe(200)
    const listed = await listResponse.json()
    expect(listed.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pendingId,
          email: adminEmail,
          identityStatus: 'bound'
        })
      ])
    )
  })

  it('does not auto-register an unprovisioned Access identity', async () => {
    const suffix = crypto.randomUUID()
    const { token, key } = await tokenFor({
      email: `unassigned-${suffix}@example.invalid`,
      subject: `unassigned-sub-${suffix}`
    })

    await expect(authenticate(token, key)).rejects.toMatchObject({
      code: 'SPACE_ACCESS_DENIED',
      status: 403
    })
  })

  it('keeps pending AdminUser ids stable so Space assignments can reference them before first login', async () => {
    const suffix = crypto.randomUUID()
    const id = `adm_pending_fixture_${suffix}`
    const email = `pending-${suffix}@example.invalid`

    await env.DB.prepare(`
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
    `).bind(id, `pending:${id}`, email, NOW_MS, NOW_MS).run()

    const spaceId = `spc_pending_${suffix}`
    await env.DB.prepare(`
      INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
      VALUES (?, ?, 'Asia/Shanghai', 'active', ?, ?)
    `).bind(spaceId, 'Synthetic Pending Admin Space', NOW_MS, NOW_MS).run()

    await expect(
      env.DB.prepare(`
        INSERT INTO space_admins (space_id, admin_user_id, created_at)
        VALUES (?, ?, ?)
      `).bind(spaceId, id, NOW_MS).run()
    ).resolves.toBeTruthy()
  })
})
