import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { authenticateAdminRequest } from '../src/lib/auth/index'
import { issueUserToken } from '../src/domains/identity/token'
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
  platformRole = 'none'
}) {
  await env.DB.prepare(`
    INSERT INTO admin_users
      (id, access_subject, email, platform_role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).bind(id, subject, email, platformRole, NOW_MS, NOW_MS).run()
}

async function insertSpace(id, name = 'Synthetic Invite Space') {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO spaces (id, name, timezone, status, created_at, updated_at)
      VALUES (?, ?, 'Asia/Shanghai', 'active', ?, ?)
    `).bind(id, name, NOW_MS, NOW_MS),
    env.DB.prepare(`
      INSERT INTO space_settings
        (space_id, cancellation_cutoff_minutes, booking_cutoff_minutes, updated_at)
      VALUES (?, 240, 60, ?)
    `).bind(id, NOW_MS)
  ])
}

async function assignAdmin(spaceId, adminId) {
  await env.DB.prepare(`
    INSERT INTO space_admins (space_id, admin_user_id, created_at)
    VALUES (?, ?, ?)
  `).bind(spaceId, adminId, NOW_MS).run()
}

async function createAdminIdentity({
  id,
  suffix,
  signingKey,
  platformRole = 'none'
}) {
  const subject = `access-${suffix}`
  const email = `${suffix}@example.invalid`
  await insertAdmin({ id, subject, email, platformRole })

  const token = await signSyntheticAccessJwt({
    ...signingKey,
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
      fetch: createSyntheticJwksFetch(signingKey.publicJwk),
      nowSeconds: NOW_SECONDS
    }
  )

  return { id, token, email }
}

async function createUser(suffix) {
  const id = `usr_${suffix}`
  await env.DB.prepare(`
    INSERT INTO users (
      id, wechat_openid, wechat_unionid, nickname, avatar_object_key,
      last_space_id, status, created_at, updated_at
    )
    VALUES (?, ?, NULL, ?, NULL, NULL, 'active', ?, ?)
  `).bind(
    id,
    `openid-${suffix}`,
    `Synthetic ${suffix}`,
    NOW_MS,
    NOW_MS
  ).run()

  const issued = await issueUserToken(id, env.USER_TOKEN_SECRET)
  return { id, token: issued.accessToken }
}

function adminRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('cf-access-jwt-assertion', token)
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, {
      ...init,
      headers
    })
  )
}

function userRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, {
      ...init,
      headers
    })
  )
}

async function createInvite(spaceId, adminToken, label = 'Synthetic Channel') {
  const response = await adminRequest(
    `/v1/admin/spaces/${spaceId}/invites`,
    adminToken,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
    }
  )
  expect(response.status).toBe(201)
  return (await response.json()).data
}

describe('Invite and SpaceMembership', () => {
  it('lets assigned Space Admins create unlimited-use invites with high-entropy codes', async () => {
    const suffix = crypto.randomUUID()
    const spaceId = `spc_invite_${suffix}`
    const signingKey = await createSyntheticAccessKey(`invite-create-${suffix}`)
    const admin = await createAdminIdentity({
      id: `adm_invite_${suffix}`,
      suffix: `invite-${suffix}`,
      signingKey
    })
    const outsider = await createAdminIdentity({
      id: `adm_outsider_${suffix}`,
      suffix: `outsider-${suffix}`,
      signingKey
    })

    await insertSpace(spaceId)
    await assignAdmin(spaceId, admin.id)

    const invite = await createInvite(spaceId, admin.token)
    expect(invite).toMatchObject({
      spaceId,
      label: 'Synthetic Channel',
      status: 'active',
      createdByAdminId: admin.id,
      memberCount: 0
    })
    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{24}$/)

    const list = await adminRequest(
      `/v1/admin/spaces/${spaceId}/invites`,
      admin.token
    )
    expect(list.status).toBe(200)
    await expect(list.json()).resolves.toMatchObject({
      data: [{ id: invite.id, code: invite.code }]
    })

    const forbidden = await adminRequest(
      `/v1/admin/spaces/${spaceId}/invites`,
      outsider.token
    )
    expect(forbidden.status).toBe(403)
  })

  it('allows many users to join with one invite and exposes immutable source data', async () => {
    const suffix = crypto.randomUUID()
    const spaceId = `spc_many_${suffix}`
    const signingKey = await createSyntheticAccessKey(`invite-many-${suffix}`)
    const admin = await createAdminIdentity({
      id: `adm_many_${suffix}`,
      suffix: `many-${suffix}`,
      signingKey
    })
    await insertSpace(spaceId)
    await assignAdmin(spaceId, admin.id)

    const invite = await createInvite(spaceId, admin.token, 'Synthetic Unlimited')
    const userA = await createUser(`many-a-${suffix}`)
    const userB = await createUser(`many-b-${suffix}`)

    const joinA = await userRequest('/v1/spaces/join', userA.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: invite.code })
    })
    const joinB = await userRequest('/v1/spaces/join', userB.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: invite.code })
    })

    expect(joinA.status).toBe(200)
    expect(joinB.status).toBe(200)
    const dataA = (await joinA.json()).data
    const dataB = (await joinB.json()).data

    expect(dataA.membership.invitedByAdminId).toBe(admin.id)
    expect(dataA.membership.inviteCodeId).toBe(invite.id)
    expect(dataB.membership.invitedByAdminId).toBe(admin.id)
    expect(dataA.membership.id).not.toBe(dataB.membership.id)

    await env.DB.prepare(`
      INSERT INTO participants (
        id, space_id, membership_id, name, birth_month,
        user_note, admin_note, status, created_at, updated_at
      )
      VALUES (?, ?, ?, 'Synthetic Participant', '2012-09',
              NULL, NULL, 'active', ?, ?)
    `).bind(
      `par_${suffix}`,
      spaceId,
      dataA.membership.id,
      NOW_MS,
      NOW_MS
    ).run()

    const list = await adminRequest(
      `/v1/admin/spaces/${spaceId}/invites`,
      admin.token
    )
    const listedInvite = (await list.json()).data.find((item) => item.id === invite.id)
    expect(listedInvite.memberCount).toBe(2)

    const members = await adminRequest(
      `/v1/admin/spaces/${spaceId}/invites/${invite.id}/members`,
      admin.token
    )
    expect(members.status).toBe(200)
    const memberData = (await members.json()).data
    expect(memberData).toHaveLength(2)
    expect(memberData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: dataA.membership.id,
          participantCount: 1,
          invitedByAdminId: admin.id,
          inviteCodeId: invite.id
        })
      ])
    )
  })

  it('keeps the original membership source when the same user joins the same Space again', async () => {
    const suffix = crypto.randomUUID()
    const spaceId = `spc_idempotent_${suffix}`
    const signingKey = await createSyntheticAccessKey(`invite-idempotent-${suffix}`)
    const adminA = await createAdminIdentity({
      id: `adm_source_a_${suffix}`,
      suffix: `source-a-${suffix}`,
      signingKey
    })
    const adminB = await createAdminIdentity({
      id: `adm_source_b_${suffix}`,
      suffix: `source-b-${suffix}`,
      signingKey
    })
    await insertSpace(spaceId)
    await assignAdmin(spaceId, adminA.id)
    await assignAdmin(spaceId, adminB.id)

    const inviteA = await createInvite(spaceId, adminA.token, 'Synthetic Source A')
    const inviteB = await createInvite(spaceId, adminB.token, 'Synthetic Source B')
    const user = await createUser(`idempotent-${suffix}`)

    const first = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: inviteA.code })
    })
    const second = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: inviteB.code })
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstData = (await first.json()).data.membership
    const secondData = (await second.json()).data.membership

    expect(secondData.id).toBe(firstData.id)
    expect(secondData.invitedByAdminId).toBe(adminA.id)
    expect(secondData.inviteCodeId).toBe(inviteA.id)

    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM space_memberships
      WHERE user_id = ? AND space_id = ?
    `).bind(user.id, spaceId).first()
    expect(count.count).toBe(1)
  })

  it('returns stable errors for expired, revoked and disabled-Space invites', async () => {
    const suffix = crypto.randomUUID()
    const signingKey = await createSyntheticAccessKey(`invite-errors-${suffix}`)
    const admin = await createAdminIdentity({
      id: `adm_errors_${suffix}`,
      suffix: `errors-${suffix}`,
      signingKey
    })
    const spaceId = `spc_errors_${suffix}`
    await insertSpace(spaceId)
    await assignAdmin(spaceId, admin.id)
    const user = await createUser(`errors-${suffix}`)

    const expiredId = `inv_expired_${suffix}`
    await env.DB.prepare(`
      INSERT INTO invite_codes (
        id, space_id, created_by_admin_id, code, label, expires_at,
        status, created_at, revoked_at
      )
      VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, NULL)
    `).bind(
      expiredId,
      spaceId,
      admin.id,
      `expired-${suffix}`,
      NOW_MS - 1000,
      NOW_MS - 2000
    ).run()

    const expired = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: `expired-${suffix}` })
    })
    expect(expired.status).toBe(409)
    await expect(expired.json()).resolves.toMatchObject({
      error: { code: 'INVITE_EXPIRED' }
    })

    const revocable = await createInvite(spaceId, admin.token, 'Synthetic Revoked')
    const revoke = await adminRequest(
      `/v1/admin/spaces/${spaceId}/invites/${revocable.id}/revoke`,
      admin.token,
      { method: 'POST' }
    )
    expect(revoke.status).toBe(200)

    const revoked = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: revocable.code })
    })
    expect(revoked.status).toBe(409)
    await expect(revoked.json()).resolves.toMatchObject({
      error: { code: 'INVITE_REVOKED' }
    })

    const disabledInvite = await createInvite(spaceId, admin.token, 'Synthetic Disabled')
    await env.DB.prepare(
      "UPDATE spaces SET status = 'disabled', updated_at = ? WHERE id = ?"
    ).bind(NOW_MS, spaceId).run()

    const disabled = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: disabledInvite.code })
    })
    expect(disabled.status).toBe(409)
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: 'SPACE_DISABLED' }
    })
  })

  it('sets the joined Space current and only switches among active memberships', async () => {
    const suffix = crypto.randomUUID()
    const signingKey = await createSyntheticAccessKey(`invite-switch-${suffix}`)
    const admin = await createAdminIdentity({
      id: `adm_switch_${suffix}`,
      suffix: `switch-${suffix}`,
      signingKey
    })
    const firstSpace = `spc_switch_a_${suffix}`
    const secondSpace = `spc_switch_b_${suffix}`
    const unjoinedSpace = `spc_switch_c_${suffix}`
    for (const spaceId of [firstSpace, secondSpace, unjoinedSpace]) {
      await insertSpace(spaceId, `Synthetic ${spaceId}`)
      await assignAdmin(spaceId, admin.id)
    }

    const firstInvite = await createInvite(firstSpace, admin.token, 'Synthetic First')
    const secondInvite = await createInvite(secondSpace, admin.token, 'Synthetic Second')
    const user = await createUser(`switch-${suffix}`)

    await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: firstInvite.code })
    })
    const secondJoin = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: secondInvite.code })
    })
    expect((await secondJoin.json()).data.currentSpaceId).toBe(secondSpace)

    const spaces = await userRequest('/v1/me/spaces', user.token)
    expect(spaces.status).toBe(200)
    expect((await spaces.json()).data.map((space) => space.id)).toEqual([
      firstSpace,
      secondSpace
    ])

    const switchBack = await userRequest('/v1/me/current-space', user.token, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spaceId: firstSpace })
    })
    expect(switchBack.status).toBe(200)
    await expect(switchBack.json()).resolves.toEqual({
      data: { currentSpaceId: firstSpace }
    })

    const profile = await userRequest('/v1/me', user.token)
    await expect(profile.json()).resolves.toMatchObject({
      data: { currentSpaceId: firstSpace }
    })

    const forbidden = await userRequest('/v1/me/current-space', user.token, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spaceId: unjoinedSpace })
    })
    expect(forbidden.status).toBe(403)
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: 'SPACE_ACCESS_DENIED' }
    })
  })

  it('exposes Space-scoped Admin member list, detail, filters and private notes', async () => {
    const suffix = crypto.randomUUID()
    const spaceId = `spc_admin_members_${suffix}`
    const signingKey = await createSyntheticAccessKey(`admin-members-${suffix}`)
    const admin = await createAdminIdentity({
      id: `adm_admin_members_${suffix}`,
      suffix: `admin-members-${suffix}`,
      signingKey
    })
    const outsider = await createAdminIdentity({
      id: `adm_admin_members_outsider_${suffix}`,
      suffix: `admin-members-outsider-${suffix}`,
      signingKey
    })

    await insertSpace(spaceId, 'Synthetic Admin Members Space')
    await assignAdmin(spaceId, admin.id)

    const invite = await createInvite(spaceId, admin.token, 'Synthetic Admin Members')
    const user = await createUser(`admin-members-${suffix}`)
    const join = await userRequest('/v1/spaces/join', user.token, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inviteCode: invite.code })
    })
    expect(join.status).toBe(200)
    const membership = (await join.json()).data.membership

    const participantId = `par_admin_members_${suffix}`
    await env.DB.prepare(`
      INSERT INTO participants (
        id, space_id, membership_id, name, birth_month,
        user_note, admin_note, status, created_at, updated_at
      )
      VALUES (?, ?, ?, 'Synthetic Participant', '2012-09',
              'Synthetic user note', NULL, 'active', ?, ?)
    `).bind(
      participantId,
      spaceId,
      membership.id,
      NOW_MS,
      NOW_MS
    ).run()

    const list = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members`,
      admin.token
    )
    expect(list.status).toBe(200)
    await expect(list.json()).resolves.toMatchObject({
      data: [{
        membershipId: membership.id,
        nickname: `Synthetic admin-members-${suffix}`,
        participantCount: 1,
        invitedByAdminId: admin.id,
        inviteCodeId: invite.id,
        status: 'active',
        adminNote: null
      }]
    })

    const filtered = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members?invitedByAdminId=${encodeURIComponent(admin.id)}&inviteCodeId=${encodeURIComponent(invite.id)}`,
      admin.token
    )
    expect(filtered.status).toBe(200)
    expect((await filtered.json()).data).toHaveLength(1)

    const emptyFilter = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members?inviteCodeId=inv_missing`,
      admin.token
    )
    expect(emptyFilter.status).toBe(200)
    expect((await emptyFilter.json()).data).toEqual([])

    const detail = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members/${membership.id}`,
      admin.token
    )
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject({
      data: {
        membershipId: membership.id,
        participantCount: 1,
        bookingCount: 0,
        participants: [{
          id: participantId,
          name: 'Synthetic Participant',
          birthMonth: '2012-09',
          status: 'active',
          userNote: 'Synthetic user note',
          adminNote: null
        }]
      }
    })

    const memberNote = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members/${membership.id}`,
      admin.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminNote: '  Synthetic private member note  ' })
      }
    )
    expect(memberNote.status).toBe(200)
    await expect(memberNote.json()).resolves.toMatchObject({
      data: { adminNote: 'Synthetic private member note' }
    })

    const participantNote = await adminRequest(
      `/v1/admin/spaces/${spaceId}/participants/${participantId}`,
      admin.token,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminNote: 'Synthetic private participant note' })
      }
    )
    expect(participantNote.status).toBe(200)

    const updatedDetail = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members/${membership.id}`,
      admin.token
    )
    await expect(updatedDetail.json()).resolves.toMatchObject({
      data: {
        adminNote: 'Synthetic private member note',
        participants: [{
          id: participantId,
          adminNote: 'Synthetic private participant note'
        }]
      }
    })

    const forbidden = await adminRequest(
      `/v1/admin/spaces/${spaceId}/members`,
      outsider.token
    )
    expect(forbidden.status).toBe(403)
  })

})
