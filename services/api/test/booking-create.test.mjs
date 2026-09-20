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

function futureWindow(hours = 48) {
  const startAt = Date.now() + hours * 60 * 60 * 1000
  return {
    startAt,
    endAt: startAt + 60 * 60 * 1000,
    localDate: new Date(startAt).toISOString().slice(0, 10)
  }
}

async function createSecondMember(ids, suffix) {
  const userId = `usr_booking_second_${suffix}`
  const membershipId = `mem_booking_second_${suffix}`
  const participantId = `par_booking_second_${suffix}`

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (
        id, wechat_openid, nickname, last_space_id, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      userId,
      `openid-booking-second-${suffix}`,
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
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      participantId,
      ids.space,
      membershipId,
      'Synthetic Second Participant',
      '2013-10',
      NOW,
      NOW
    )
  ])

  return {
    userId,
    membershipId,
    participantId,
    token: await tokenFor(userId)
  }
}

describe('Booking creation', () => {
  it('creates a Booking for an active member and active participant on an open Slot', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-create-${suffix}`)
    const token = await tokenFor(ids.user)
    const window = futureWindow()
    const slotId = `slot_booking_create_${suffix}`

    await insertSlot(ids, { id: slotId, ...window })

    const response = await bookingRequest(
      ids.space,
      token,
      slotId,
      ids.participant
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.data).toMatchObject({
      spaceId: ids.space,
      slotId,
      participantId: ids.participant,
      status: 'booked'
    })
    expect(body.data.id).toMatch(/^bkg_/)

    const row = await env.DB.prepare(`
      SELECT membership_id, participant_id, status
      FROM bookings
      WHERE id = ?
    `).bind(body.data.id).first()

    expect(row).toEqual({
      membership_id: ids.membership,
      participant_id: ids.participant,
      status: 'booked'
    })
  })

  it('requires active membership and an owned active participant', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-identity-${suffix}`)
    const token = await tokenFor(ids.user)
    const window = futureWindow()
    const slotId = `slot_booking_identity_${suffix}`
    await insertSlot(ids, { id: slotId, ...window })

    await env.DB.prepare(
      'UPDATE participants SET status = ? WHERE id = ?'
    ).bind('inactive', ids.participant).run()

    const inactiveParticipant = await bookingRequest(
      ids.space,
      token,
      slotId,
      ids.participant
    )
    expect(inactiveParticipant.status).toBe(400)
    await expect(inactiveParticipant.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' }
    })

    await env.DB.prepare(
      'UPDATE participants SET status = ? WHERE id = ?'
    ).bind('active', ids.participant).run()
    await env.DB.prepare(
      'UPDATE space_memberships SET status = ? WHERE id = ?'
    ).bind('inactive', ids.membership).run()

    const inactiveMembership = await bookingRequest(
      ids.space,
      token,
      slotId,
      ids.participant
    )
    expect(inactiveMembership.status).toBe(403)
    await expect(inactiveMembership.json()).resolves.toMatchObject({
      error: { code: 'SPACE_ACCESS_DENIED' }
    })

    const other = await seedBookingFixture(`booking-other-${suffix}`)
    const foreignParticipant = await bookingRequest(
      other.space,
      token,
      `slot_missing_${suffix}`,
      other.participant
    )
    expect(foreignParticipant.status).toBe(403)
  })

  it('rejects disabled Space, inactive Resource, frozen Slot and booking cutoff', async () => {
    const suffix = crypto.randomUUID()

    {
      const ids = await seedBookingFixture(`booking-space-${suffix}`)
      const token = await tokenFor(ids.user)
      const window = futureWindow()
      const slotId = `slot_booking_space_${suffix}`
      await insertSlot(ids, { id: slotId, ...window })
      await env.DB.prepare('UPDATE spaces SET status = ? WHERE id = ?')
        .bind('disabled', ids.space).run()

      const response = await bookingRequest(ids.space, token, slotId, ids.participant)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'SPACE_DISABLED' }
      })
    }

    {
      const ids = await seedBookingFixture(`booking-resource-${suffix}`)
      const token = await tokenFor(ids.user)
      const window = futureWindow()
      const slotId = `slot_booking_resource_${suffix}`
      await insertSlot(ids, { id: slotId, ...window })
      await env.DB.prepare('UPDATE resources SET status = ? WHERE id = ?')
        .bind('inactive', ids.resource).run()

      const response = await bookingRequest(ids.space, token, slotId, ids.participant)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'SLOT_NOT_BOOKABLE' }
      })
    }

    {
      const ids = await seedBookingFixture(`booking-frozen-${suffix}`)
      const token = await tokenFor(ids.user)
      const window = futureWindow()
      const slotId = `slot_booking_frozen_${suffix}`
      await insertSlot(ids, { id: slotId, ...window, status: 'frozen' })

      const response = await bookingRequest(ids.space, token, slotId, ids.participant)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'SLOT_FROZEN' }
      })
    }

    {
      const ids = await seedBookingFixture(`booking-cutoff-${suffix}`)
      const token = await tokenFor(ids.user)
      const startAt = Date.now() + 30 * 60 * 1000
      const slotId = `slot_booking_cutoff_${suffix}`
      await insertSlot(ids, {
        id: slotId,
        startAt,
        endAt: startAt + 60 * 60 * 1000,
        localDate: new Date(startAt).toISOString().slice(0, 10)
      })

      const response = await bookingRequest(ids.space, token, slotId, ids.participant)
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'BOOKING_CUTOFF_REACHED' }
      })
    }
  })

  it('maps an occupied Slot to SLOT_ALREADY_BOOKED', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-occupied-${suffix}`)
    const token = await tokenFor(ids.user)
    const window = futureWindow()
    const slotId = `slot_booking_occupied_${suffix}`

    await insertSlot(ids, { id: slotId, ...window })
    await insertBooking(ids, {
      id: `booking_existing_${suffix}`,
      slotId
    })

    const response = await bookingRequest(ids.space, token, slotId, ids.participant)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'SLOT_ALREADY_BOOKED',
        message: '这个时间刚刚被预约了，请选择其他时间。'
      }
    })
  })

  it('allows only one winner when two users concurrently book the same Slot', async () => {
    const suffix = crypto.randomUUID()
    const ids = await seedBookingFixture(`booking-race-${suffix}`)
    const second = await createSecondMember(ids, suffix)
    const firstToken = await tokenFor(ids.user)
    const window = futureWindow()
    const slotId = `slot_booking_race_${suffix}`

    await insertSlot(ids, { id: slotId, ...window })

    const [first, secondResponse] = await Promise.all([
      bookingRequest(ids.space, firstToken, slotId, ids.participant),
      bookingRequest(ids.space, second.token, slotId, second.participantId)
    ])

    const responses = [first, secondResponse]
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])

    const loser = responses.find((response) => response.status === 409)
    await expect(loser.json()).resolves.toMatchObject({
      error: { code: 'SLOT_ALREADY_BOOKED' }
    })

    const active = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE slot_id = ?
        AND status IN ('booked', 'completed')
    `).bind(slotId).first()

    expect(active?.count).toBe(1)
  })
})
