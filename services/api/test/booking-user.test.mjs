import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../src/domains/identity/token'
import {
  NOW,
  insertBooking,
  insertSlot,
  seedBookingFixture
} from './helpers/d1-fixture.mjs'

async function tokenFor(userId) {
  const issued = await issueUserToken(userId, env.USER_TOKEN_SECRET)
  return issued.accessToken
}

function userRequest(path, token, init = {}) {
  const headers = new Headers(init.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
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
  const userId = `usr_booking_query_second_${suffix}`
  const membershipId = `mem_booking_query_second_${suffix}`
  const participantId = `par_booking_query_second_${suffix}`

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (
        id, wechat_openid, nickname, last_space_id, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      userId,
      `openid-booking-query-second-${suffix}`,
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

  return { userId, membershipId, participantId }
}

describe('Booking user query and cancellation', () => {
  it('lists and reads only the current membership bookings with shared date/status filters', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-query-${suffix}`)
    const token = await tokenFor(ids.user)
    const second = await createSecondMember(ids, suffix)

    const firstStart = Date.now() + 72 * 60 * 60 * 1000
    const secondStart = firstStart + 3 * 60 * 60 * 1000
    const firstSlot = `slot_booking_query_first_${suffix}`
    const secondSlot = `slot_booking_query_second_${suffix}`
    const date = localDate(firstStart)

    await insertSlot(ids, {
      id: firstSlot,
      startAt: firstStart,
      endAt: firstStart + 60 * 60 * 1000,
      localDate: date
    })
    await insertSlot(ids, {
      id: secondSlot,
      startAt: secondStart,
      endAt: secondStart + 60 * 60 * 1000,
      localDate: localDate(secondStart)
    })

    const create = await bookingRequest(ids.space, token, firstSlot, ids.participant)
    expect(create.status).toBe(201)
    const ownBooking = (await create.json()).data

    await env.DB.prepare(`
      INSERT INTO bookings (
        id, space_id, slot_id, membership_id, participant_id,
        status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'booked', ?, ?)
    `).bind(
      `bkg_booking_query_foreign_${suffix}`,
      ids.space,
      secondSlot,
      second.membershipId,
      second.participantId,
      NOW,
      NOW
    ).run()

    const list = await userRequest(
      `/v1/spaces/${ids.space}/bookings?from=${date}&to=${date}&status=booked`,
      token
    )
    expect(list.status).toBe(200)
    const listBody = await list.json()
    expect(listBody.data).toHaveLength(1)
    expect(listBody.data[0]).toMatchObject({
      id: ownBooking.id,
      participant: { id: ids.participant },
      resource: { id: ids.resource },
      slotType: { id: ids.slotType },
      slot: { id: firstSlot }
    })

    const detail = await userRequest(
      `/v1/spaces/${ids.space}/bookings/${ownBooking.id}`,
      token
    )
    expect(detail.status).toBe(200)
    await expect(detail.json()).resolves.toMatchObject({
      data: {
        id: ownBooking.id,
        slot: { id: firstSlot },
        participant: { id: ids.participant }
      }
    })

    const foreignDetail = await userRequest(
      `/v1/spaces/${ids.space}/bookings/bkg_booking_query_foreign_${suffix}`,
      token
    )
    expect(foreignDetail.status).toBe(404)
    await expect(foreignDetail.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' }
    })
  })

  it('cancels before the cutoff, records history and releases the Slot for rebooking', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-cancel-${suffix}`)
    const token = await tokenFor(ids.user)
    const startAt = Date.now() + 3 * 60 * 60 * 1000
    const slotId = `slot_booking_cancel_${suffix}`

    await insertSlot(ids, {
      id: slotId,
      startAt,
      endAt: startAt + 60 * 60 * 1000,
      localDate: localDate(startAt)
    })

    const create = await bookingRequest(ids.space, token, slotId, ids.participant)
    const booking = (await create.json()).data

    const cancel = await userRequest(
      `/v1/spaces/${ids.space}/bookings/${booking.id}/cancel`,
      token,
      { method: 'POST' }
    )
    expect(cancel.status).toBe(200)
    await expect(cancel.json()).resolves.toMatchObject({
      data: { id: booking.id, status: 'cancelled' }
    })

    const actions = await env.DB.prepare(`
      SELECT action
      FROM booking_history
      WHERE booking_id = ?
      ORDER BY created_at ASC, id ASC
    `).bind(booking.id).all()

    expect(actions.results.map((row) => row.action)).toEqual([
      'created',
      'cancelled'
    ])

    const rebook = await bookingRequest(ids.space, token, slotId, ids.participant)
    expect(rebook.status).toBe(201)
    expect((await rebook.json()).data.id).not.toBe(booking.id)
  })

  it('enforces cancellation cutoff but allows an existing frozen Slot booking to cancel', async () => {
    const suffix = crypto.randomUUID()

    {
      const ids = await seedBookingFixture(`booking-cancel-cutoff-${suffix}`)
      const token = await tokenFor(ids.user)
      const startAt = Date.now() + 30 * 60 * 1000
      const slotId = `slot_booking_cancel_cutoff_${suffix}`
      const bookingId = `bkg_booking_cancel_cutoff_${suffix}`

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
      const ids = await seedBookingFixture(`booking-cancel-frozen-${suffix}`)
      const token = await tokenFor(ids.user)
      const startAt = Date.now() + 3 * 60 * 60 * 1000
      const slotId = `slot_booking_cancel_frozen_${suffix}`
      const bookingId = `bkg_booking_cancel_frozen_${suffix}`

      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: localDate(startAt)
      })
      await insertBooking(ids, { id: bookingId, slotId })
      await env.DB.prepare('UPDATE slots SET status = ? WHERE id = ?')
        .bind('frozen', slotId)
        .run()

      const response = await userRequest(
        `/v1/spaces/${ids.space}/bookings/${bookingId}/cancel`,
        token,
        { method: 'POST' }
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        data: { status: 'cancelled', slot: { status: 'frozen' } }
      })

      const rebook = await bookingRequest(ids.space, token, slotId, ids.participant)
      expect(rebook.status).toBe(409)
      await expect(rebook.json()).resolves.toMatchObject({
        error: { code: 'SLOT_FROZEN' }
      })
    }
  })
})
