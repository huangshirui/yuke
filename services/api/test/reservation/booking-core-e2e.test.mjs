import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../../src/domains/identity/token'
import { authenticateAdminRequest } from '../../src/lib/auth/index'
import {
  createSyntheticAccessKey,
  createSyntheticJwksFetch,
  signSyntheticAccessJwt
} from '../helpers/access-jwt.mjs'
import {
  NOW,
  insertBooking,
  insertSlot,
  seedBookingFixture
} from '../helpers/d1-fixture.mjs'

const TEAM_DOMAIN = 'https://synthetic-team.cloudflareaccess.com'
const AUDIENCE = 'synthetic-access-audience'
const NOW_SECONDS = Math.floor(Date.now() / 1000)

async function userToken(userId) {
  return (await issueUserToken(userId, env.USER_TOKEN_SECRET)).accessToken
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

function bookingRequest(spaceId, token, slotId, participantId) {
  return userRequest(`/v1/spaces/${spaceId}/bookings`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slotId, participantId })
  })
}

async function adminTokenForFixture(ids, suffix) {
  const key = await createSyntheticAccessKey(`booking-e2e-${suffix}`)
  const token = await signSyntheticAccessJwt({
    ...key,
    issuer: TEAM_DOMAIN,
    audience: AUDIENCE,
    subject: `access-${suffix}`,
    email: `${suffix}@example.invalid`,
    nowSeconds: NOW_SECONDS
  })

  // Prime the verifier cache with a fully synthetic JWKS response. Subsequent
  // Worker requests exercise the normal Admin middleware and Space RBAC.
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
    new Request(`https://example.invalid${path}`, {
      ...init,
      headers
    })
  )
}

function localDate(epochMs, timezone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(epochMs))
  const read = (type) => parts.find((part) => part.type === type)?.value
  return `${read('year')}-${read('month')}-${read('day')}`
}

async function createSecondMember(ids, suffix) {
  const userId = `usr_booking_e2e_second_${suffix}`
  const membershipId = `mem_booking_e2e_second_${suffix}`
  const participantId = `par_booking_e2e_second_${suffix}`

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (
        id, wechat_openid, nickname, last_space_id, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      userId,
      `openid-booking-e2e-second-${suffix}`,
      'Synthetic Second User',
      ids.space,
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO space_memberships (
        id, space_id, user_id, invited_by_admin_id, invite_code_id,
        status, joined_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      membershipId,
      ids.space,
      userId,
      ids.admin,
      ids.invite,
      NOW,
      NOW
    ),
    env.DB.prepare(`
      INSERT INTO participants (
        id, space_id, membership_id, name, birth_month, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, '2013-10', 'active', ?, ?)
    `).bind(
      participantId,
      ids.space,
      membershipId,
      'Synthetic Second Participant',
      NOW,
      NOW
    )
  ])

  return {
    userId,
    membershipId,
    participantId,
    token: await userToken(userId)
  }
}

async function createSecondParticipant(ids, suffix) {
  const participantId = `par_booking_e2e_alt_${suffix}`
  await env.DB.prepare(`
    INSERT INTO participants (
      id, space_id, membership_id, name, birth_month, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, '2014-11', 'active', ?, ?)
  `).bind(
    participantId,
    ids.space,
    ids.membership,
    'Synthetic Alternate Participant',
    NOW,
    NOW
  ).run()

  return participantId
}

async function activeBookingCount(slotId) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM bookings
    WHERE slot_id = ?
      AND status IN ('booked', 'completed')
  `).bind(slotId).first()

  return Number(row?.count || 0)
}

describe('Phase 4 Booking Core E2E Gate', () => {
  it('allows exactly one winner for concurrent requests and persists one active Booking', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`gate-race-${suffix}`)
    const second = await createSecondMember(ids, suffix)
    const firstToken = await userToken(ids.user)
    const startAt = Date.now() + 72 * 60 * 60 * 1000
    const slotId = `slot_gate_race_${suffix}`

    await insertSlot(ids, {
      id: slotId,
      startAt,
      endAt: startAt + 60 * 60 * 1000,
      localDate: localDate(startAt)
    })

    const responses = await Promise.all([
      bookingRequest(ids.space, firstToken, slotId, ids.participant),
      bookingRequest(ids.space, second.token, slotId, second.participantId)
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])

    const loser = responses.find((response) => response.status === 409)
    await expect(loser.json()).resolves.toMatchObject({
      error: { code: 'SLOT_ALREADY_BOOKED' }
    })
    expect(await activeBookingCount(slotId)).toBe(1)
  })

  it('keeps booking/cancellation cutoffs and frozen Slot behavior intact', async () => {
    const suffix = crypto.randomUUID()

    {
      const ids = await seedBookingFixture(`gate-booking-cutoff-${suffix}`)
      const token = await userToken(ids.user)
      const startAt = Date.now() + 30 * 60 * 1000
      const slotId = `slot_gate_booking_cutoff_${suffix}`

      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt)
      })

      const response = await bookingRequest(
        ids.space,
        token,
        slotId,
        ids.participant
      )
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'BOOKING_CUTOFF_REACHED' }
      })
    }

    {
      const ids = await seedBookingFixture(`gate-cancel-cutoff-${suffix}`)
      const token = await userToken(ids.user)
      const startAt = Date.now() + 30 * 60 * 1000
      const slotId = `slot_gate_cancel_cutoff_${suffix}`
      const bookingId = `bkg_gate_cancel_cutoff_${suffix}`

      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt)
      })
      await insertBooking(ids, { id: bookingId, slotId })

      const response = await userRequest(
        `/v1/spaces/${ids.space}/bookings/${bookingId}/cancel`,
        token,
        { method: 'POST' }
      )
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'CANCELLATION_CUTOFF_REACHED' }
      })
    }

    {
      const ids = await seedBookingFixture(`gate-frozen-${suffix}`)
      const token = await userToken(ids.user)
      const startAt = Date.now() + 72 * 60 * 60 * 1000
      const slotId = `slot_gate_frozen_${suffix}`

      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt),
        status: 'frozen'
      })

      const response = await bookingRequest(
        ids.space,
        token,
        slotId,
        ids.participant
      )
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'SLOT_FROZEN' }
      })
    }
  })

  it('rejects Admin moves to occupied and frozen Slots without mutating the Booking', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`gate-admin-conflict-${suffix}`)
    const adminToken = await adminTokenForFixture(ids, `gate-admin-conflict-${suffix}`)
    const userAccessToken = await userToken(ids.user)

    const sourceStart = Date.now() + 72 * 60 * 60 * 1000
    const occupiedStart = sourceStart + 3 * 60 * 60 * 1000
    const frozenStart = occupiedStart + 3 * 60 * 60 * 1000
    const sourceSlot = `slot_gate_source_${suffix}`
    const occupiedSlot = `slot_gate_occupied_${suffix}`
    const frozenSlot = `slot_gate_frozen_move_${suffix}`

    await insertSlot(ids, {
      id: sourceSlot,
      startAt: sourceStart,
      endAt: sourceStart + 60 * 60 * 1000,
      localDate: localDate(sourceStart)
    })
    await insertSlot(ids, {
      id: occupiedSlot,
      startAt: occupiedStart,
      endAt: occupiedStart + 60 * 60 * 1000,
      localDate: localDate(occupiedStart)
    })
    await insertSlot(ids, {
      id: frozenSlot,
      startAt: frozenStart,
      endAt: frozenStart + 60 * 60 * 1000,
      localDate: localDate(frozenStart),
      status: 'frozen'
    })

    const created = await bookingRequest(
      ids.space,
      userAccessToken,
      sourceSlot,
      ids.participant
    )
    expect(created.status).toBe(201)
    const booking = (await created.json()).data

    await insertBooking(ids, {
      id: `bkg_gate_occupied_${suffix}`,
      slotId: occupiedSlot
    })

    const occupied = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings/${booking.id}`,
      adminToken,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotId: occupiedSlot })
      }
    )
    expect(occupied.status).toBe(409)
    await expect(occupied.json()).resolves.toMatchObject({
      error: { code: 'SLOT_ALREADY_BOOKED' }
    })

    const frozen = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings/${booking.id}`,
      adminToken,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotId: frozenSlot })
      }
    )
    expect(frozen.status).toBe(409)
    await expect(frozen.json()).resolves.toMatchObject({
      error: { code: 'SLOT_FROZEN' }
    })

    const row = await env.DB.prepare(
      'SELECT slot_id, status FROM bookings WHERE id = ?'
    ).bind(booking.id).first()

    expect(row).toEqual({
      slot_id: sourceSlot,
      status: 'booked'
    })
  })

  it('keeps User, Admin and D1 consistent through create → view → modify → refresh → cancel', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`gate-flow-${suffix}`)
    const userAccessToken = await userToken(ids.user)
    const adminToken = await adminTokenForFixture(ids, `gate-flow-${suffix}`)
    const alternateParticipant = await createSecondParticipant(ids, suffix)

    const sourceStart = Date.now() + 96 * 60 * 60 * 1000
    const targetStart = sourceStart + 4 * 60 * 60 * 1000
    const sourceSlot = `slot_gate_flow_source_${suffix}`
    const targetSlot = `slot_gate_flow_target_${suffix}`

    await insertSlot(ids, {
      id: sourceSlot,
      startAt: sourceStart,
      endAt: sourceStart + 60 * 60 * 1000,
      localDate: localDate(sourceStart)
    })
    await insertSlot(ids, {
      id: targetSlot,
      startAt: targetStart,
      endAt: targetStart + 60 * 60 * 1000,
      localDate: localDate(targetStart)
    })

    const create = await bookingRequest(
      ids.space,
      userAccessToken,
      sourceSlot,
      ids.participant
    )
    expect(create.status).toBe(201)
    const booking = (await create.json()).data

    const adminList = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings?status=booked`,
      adminToken
    )
    expect(adminList.status).toBe(200)
    expect((await adminList.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: booking.id,
          membershipId: ids.membership,
          slotId: sourceSlot,
          participantId: ids.participant,
          status: 'booked'
        })
      ])
    )

    const adminUpdate = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings/${booking.id}`,
      adminToken,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slotId: targetSlot,
          participantId: alternateParticipant
        })
      }
    )
    expect(adminUpdate.status).toBe(200)
    await expect(adminUpdate.json()).resolves.toMatchObject({
      data: {
        id: booking.id,
        membershipId: ids.membership,
        slotId: targetSlot,
        participantId: alternateParticipant,
        status: 'booked'
      }
    })

    expect(await activeBookingCount(sourceSlot)).toBe(0)
    expect(await activeBookingCount(targetSlot)).toBe(1)

    const userRefresh = await userRequest(
      `/v1/spaces/${ids.space}/bookings/${booking.id}`,
      userAccessToken
    )
    expect(userRefresh.status).toBe(200)
    await expect(userRefresh.json()).resolves.toMatchObject({
      data: {
        id: booking.id,
        slotId: targetSlot,
        participantId: alternateParticipant,
        status: 'booked',
        slot: { id: targetSlot },
        participant: { id: alternateParticipant }
      }
    })

    const cancel = await userRequest(
      `/v1/spaces/${ids.space}/bookings/${booking.id}/cancel`,
      userAccessToken,
      { method: 'POST' }
    )
    expect(cancel.status).toBe(200)
    await expect(cancel.json()).resolves.toMatchObject({
      data: {
        id: booking.id,
        slotId: targetSlot,
        participantId: alternateParticipant,
        status: 'cancelled'
      }
    })

    const adminRefresh = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings/${booking.id}`,
      adminToken
    )
    expect(adminRefresh.status).toBe(200)
    await expect(adminRefresh.json()).resolves.toMatchObject({
      data: {
        id: booking.id,
        membershipId: ids.membership,
        slotId: targetSlot,
        participantId: alternateParticipant,
        status: 'cancelled'
      }
    })

    const row = await env.DB.prepare(`
      SELECT slot_id, participant_id, membership_id, status
      FROM bookings
      WHERE id = ?
    `).bind(booking.id).first()

    expect(row).toEqual({
      slot_id: targetSlot,
      participant_id: alternateParticipant,
      membership_id: ids.membership,
      status: 'cancelled'
    })
    expect(await activeBookingCount(targetSlot)).toBe(0)

    const history = await env.DB.prepare(`
      SELECT action, actor_kind, actor_user_id, actor_admin_id
      FROM booking_history
      WHERE booking_id = ?
      ORDER BY created_at ASC, id ASC
    `).bind(booking.id).all()

    expect(history.results.map((item) => item.action)).toEqual([
      'created',
      'updated',
      'cancelled'
    ])
    expect(history.results[0]).toMatchObject({
      actor_kind: 'user',
      actor_user_id: ids.user
    })
    expect(history.results[1]).toMatchObject({
      actor_kind: 'admin',
      actor_admin_id: ids.admin
    })
    expect(history.results[2]).toMatchObject({
      actor_kind: 'user',
      actor_user_id: ids.user
    })
  })
})
