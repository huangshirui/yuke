import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../src/domains/identity/token'
import { authenticateAdminRequest } from '../src/lib/auth/index'
import {
  createSyntheticAccessKey,
  createSyntheticJwksFetch,
  signSyntheticAccessJwt
} from './helpers/access-jwt.mjs'
import {
  NOW,
  insertBooking,
  insertSlot,
  seedBookingFixture
} from './helpers/d1-fixture.mjs'

const TEAM_DOMAIN = 'https://synthetic-team.cloudflareaccess.com'
const AUDIENCE = 'synthetic-access-audience'
const NOW_SECONDS = Math.floor(Date.now() / 1000)

async function userToken(userId) {
  return (await issueUserToken(userId, env.USER_TOKEN_SECRET)).accessToken
}

function userRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, { ...init, headers })
  )
}

async function adminTokenForFixture(ids, suffix) {
  const key = await createSyntheticAccessKey(`booking-admin-${suffix}`)
  const token = await signSyntheticAccessJwt({
    ...key,
    issuer: TEAM_DOMAIN,
    audience: AUDIENCE,
    subject: `access-${suffix}`,
    email: `${suffix}@example.invalid`,
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

async function createBookingViaApi(ids, slotId) {
  const token = await userToken(ids.user)
  const response = await userRequest(
    `/v1/spaces/${ids.space}/bookings`,
    token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slotId,
        participantId: ids.participant
      })
    }
  )
  expect(response.status).toBe(201)
  return (await response.json()).data
}

async function createSecondParticipant(ids, suffix) {
  const id = `par_booking_admin_second_${suffix}`
  await env.DB.prepare(`
    INSERT INTO participants (
      id, space_id, membership_id, name, birth_month, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, '2014-11', 'active', ?, ?)
  `).bind(
    id,
    ids.space,
    ids.membership,
    'Synthetic Alternate Participant',
    NOW,
    NOW
  ).run()
  return id
}

describe('Admin Booking mutations and history', () => {
  it('lists with admin filters and updates Slot/Participant with audit history', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(suffix)
    const adminToken = await adminTokenForFixture(ids, suffix)
    const secondParticipant = await createSecondParticipant(ids, suffix)

    const firstStart = Date.now() + 72 * 60 * 60 * 1000
    const secondStart = firstStart + 3 * 60 * 60 * 1000
    const firstSlot = `slot_booking_admin_first_${suffix}`
    const secondSlot = `slot_booking_admin_second_${suffix}`

    await insertSlot(ids, {
      id: firstSlot,
      startAt: firstStart,
      endAt: firstStart + 60 * 60 * 1000,
      localDate: localDate(firstStart)
    })
    await insertSlot(ids, {
      id: secondSlot,
      startAt: secondStart,
      endAt: secondStart + 60 * 60 * 1000,
      localDate: localDate(secondStart)
    })

    const booking = await createBookingViaApi(ids, firstSlot)

    const list = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings?participantId=${ids.participant}&resourceId=${ids.resource}&slotTypeId=${ids.slotType}&status=booked`,
      adminToken
    )
    expect(list.status).toBe(200)
    expect((await list.json()).data.map((item) => item.id)).toEqual([booking.id])

    const byMembership = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings?membershipId=${ids.membership}`,
      adminToken
    )
    expect(byMembership.status).toBe(200)
    expect((await byMembership.json()).data.map((item) => item.id)).toEqual([booking.id])

    const missingMembership = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings?membershipId=mem_missing`,
      adminToken
    )
    expect(missingMembership.status).toBe(200)
    expect((await missingMembership.json()).data).toEqual([])

    const patch = await adminRequest(
      `/v1/admin/spaces/${ids.space}/bookings/${booking.id}`,
      adminToken,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slotId: secondSlot,
          participantId: secondParticipant
        })
      }
    )
    expect(patch.status).toBe(200)
    await expect(patch.json()).resolves.toMatchObject({
      data: {
        id: booking.id,
        membershipId: ids.membership,
        slotId: secondSlot,
        participantId: secondParticipant,
        slot: { id: secondSlot },
        participant: { id: secondParticipant }
      }
    })

    const history = await env.DB.prepare(`
      SELECT action, actor_kind, actor_admin_id
      FROM booking_history
      WHERE booking_id = ?
      ORDER BY created_at ASC, id ASC
    `).bind(booking.id).all()

    expect(history.results.map((row) => row.action)).toEqual(['created', 'updated'])
    expect(history.results[1]).toMatchObject({
      actor_kind: 'admin',
      actor_admin_id: ids.admin
    })
  })

  it('revalidates capacity and target Slot state when an Admin moves a Booking', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(suffix)
    const adminToken = await adminTokenForFixture(ids, suffix)

    const firstStart = Date.now() + 72 * 60 * 60 * 1000
    const secondStart = firstStart + 3 * 60 * 60 * 1000
    const thirdStart = secondStart + 3 * 60 * 60 * 1000
    const sourceSlot = `slot_booking_move_source_${suffix}`
    const occupiedSlot = `slot_booking_move_occupied_${suffix}`
    const frozenSlot = `slot_booking_move_frozen_${suffix}`

    await insertSlot(ids, {
      id: sourceSlot,
      startAt: firstStart,
      endAt: firstStart + 60 * 60 * 1000,
      localDate: localDate(firstStart)
    })
    await insertSlot(ids, {
      id: occupiedSlot,
      startAt: secondStart,
      endAt: secondStart + 60 * 60 * 1000,
      localDate: localDate(secondStart)
    })
    await insertSlot(ids, {
      id: frozenSlot,
      startAt: thirdStart,
      endAt: thirdStart + 60 * 60 * 1000,
      localDate: localDate(thirdStart),
      status: 'frozen'
    })

    const booking = await createBookingViaApi(ids, sourceSlot)
    await insertBooking(ids, {
      id: `bkg_booking_move_occupied_${suffix}`,
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
  })

  it('supports Admin cancel and complete and records each transition', async () => {
    const suffix = crypto.randomUUID()

    {
      const ids = await seedBookingFixture(`${suffix}-cancel`)
      const adminToken = await adminTokenForFixture(ids, `${suffix}-cancel`)
      const startAt = Date.now() + 2 * 60 * 60 * 1000
      const slotId = `slot_booking_admin_cancel_${suffix}`
      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt)
      })
      const booking = await createBookingViaApi(ids, slotId)

      const cancelOccupiedSlot = await adminRequest(
        `/v1/admin/spaces/${ids.space}/slots/${slotId}/cancel`,
        adminToken,
        { method: 'POST' }
      )
      expect(cancelOccupiedSlot.status).toBe(409)
      await expect(cancelOccupiedSlot.json()).resolves.toMatchObject({
        error: { code: 'SLOT_NOT_BOOKABLE' }
      })

      const cancel = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings/${booking.id}/cancel`,
        adminToken,
        { method: 'POST' }
      )
      expect(cancel.status).toBe(200)
      await expect(cancel.json()).resolves.toMatchObject({
        data: { id: booking.id, status: 'cancelled' }
      })

      const actions = await env.DB.prepare(
        'SELECT action FROM booking_history WHERE booking_id = ? ORDER BY created_at ASC, id ASC'
      ).bind(booking.id).all()
      expect(actions.results.map((row) => row.action)).toEqual([
        'created',
        'cancelled'
      ])

      const cancelReleasedSlot = await adminRequest(
        `/v1/admin/spaces/${ids.space}/slots/${slotId}/cancel`,
        adminToken,
        { method: 'POST' }
      )
      expect(cancelReleasedSlot.status).toBe(200)
      await expect(cancelReleasedSlot.json()).resolves.toMatchObject({
        data: { id: slotId, status: 'cancelled' }
      })
    }

    {
      const ids = await seedBookingFixture(`${suffix}-complete`)
      const adminToken = await adminTokenForFixture(ids, `${suffix}-complete`)
      const startAt = Date.now() + 2 * 60 * 60 * 1000
      const slotId = `slot_booking_admin_complete_${suffix}`
      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt)
      })
      const booking = await createBookingViaApi(ids, slotId)

      const complete = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings/${booking.id}/complete`,
        adminToken,
        { method: 'POST' }
      )
      expect(complete.status).toBe(200)
      await expect(complete.json()).resolves.toMatchObject({
        data: {
          id: booking.id,
          status: 'completed',
          completion: {
            source: 'manual',
            completedAt: expect.any(String)
          },
          reconciliation: {
            status: 'pending',
            settledAt: null,
            source: null
          }
        }
      })

      const pendingList = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings?reconciliationStatus=pending`,
        adminToken
      )
      expect(pendingList.status).toBe(200)
      expect((await pendingList.json()).data.map((item) => item.id)).toContain(booking.id)

      const cancelCompletedSlot = await adminRequest(
        `/v1/admin/spaces/${ids.space}/slots/${slotId}/cancel`,
        adminToken,
        { method: 'POST' }
      )
      expect(cancelCompletedSlot.status).toBe(409)

      const reconcile = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings/${booking.id}/reconcile`,
        adminToken,
        { method: 'POST' }
      )
      expect(reconcile.status).toBe(200)
      await expect(reconcile.json()).resolves.toMatchObject({
        data: {
          id: booking.id,
          status: 'completed',
          reconciliation: {
            status: 'settled',
            source: 'manual',
            settledAt: expect.any(String),
            settledByAdminId: ids.admin
          }
        }
      })

      const settledList = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings?reconciliationStatus=settled`,
        adminToken
      )
      expect(settledList.status).toBe(200)
      expect((await settledList.json()).data.map((item) => item.id)).toContain(booking.id)

      const reconcileAgain = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings/${booking.id}/reconcile`,
        adminToken,
        { method: 'POST' }
      )
      expect(reconcileAgain.status).toBe(200)

      const cancelCompleted = await adminRequest(
        `/v1/admin/spaces/${ids.space}/bookings/${booking.id}/cancel`,
        adminToken,
        { method: 'POST' }
      )
      expect(cancelCompleted.status).toBe(400)

      const actions = await env.DB.prepare(
        'SELECT action FROM booking_history WHERE booking_id = ? ORDER BY created_at ASC, id ASC'
      ).bind(booking.id).all()
      expect(actions.results.map((row) => row.action)).toEqual([
        'created',
        'completed'
      ])
    }
  })
})
