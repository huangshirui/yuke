import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../../src/domains/identity/token'
import { createAdminSlot } from '../../src/domains/resource/slot/service'
import {
  createAdminSlotSeries,
  ensureSeriesMaterialized
} from '../../src/domains/resource/series/service'
import {
  NOW,
  insertBooking,
  insertSlot,
  seedBookingFixture
} from '../helpers/d1-fixture.mjs'

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

function userRequest(path, token) {
  return exports.default.fetch(
    new Request(`https://example.invalid${path}`, {
      headers: { authorization: `Bearer ${token}` }
    })
  )
}

describe('Phase 3 Scheduling Gate', () => {
  it('materializes the same weekly Series window idempotently in the Space timezone', async () => {
    const ids = await seedBookingFixture(`p3-series-${crypto.randomUUID()}`)
    const series = await createAdminSlotSeries(
      env.DB,
      ids.space,
      ids.admin,
      {
        resourceId: ids.resource,
        slotTypeId: ids.slotType,
        weekdays: [1],
        localStartTime: '09:00',
        localEndTime: '12:00',
        startsOn: '2026-09-21',
        endsOn: null
      }
    )

    const first = await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-21',
      '2026-09-21'
    )
    const second = await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-21',
      '2026-09-21'
    )

    expect(first).toBe(1)
    expect(second).toBe(0)

    const rows = await env.DB.prepare(`
      SELECT series_id, series_occurrence_date, start_at, end_at
      FROM slots
      WHERE series_id = ?
    `).bind(series.id).all()

    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]).toMatchObject({
      series_id: series.id,
      series_occurrence_date: '2026-09-21',
      start_at: Date.parse('2026-09-21T01:00:00.000Z'),
      end_at: Date.parse('2026-09-21T04:00:00.000Z')
    })
  })

  it('maps Resource overlap to the stable SLOT_OVERLAP domain error', async () => {
    const ids = await seedBookingFixture(`p3-overlap-${crypto.randomUUID()}`)

    await createAdminSlot(env.DB, ids.space, ids.admin, {
      resourceId: ids.resource,
      slotTypeId: ids.slotType,
      startAt: '2026-09-22T01:00:00.000Z',
      endAt: '2026-09-22T04:00:00.000Z'
    })

    await expect(
      createAdminSlot(env.DB, ids.space, ids.admin, {
        resourceId: ids.resource,
        slotTypeId: ids.slotType,
        startAt: '2026-09-22T02:00:00.000Z',
        endAt: '2026-09-22T03:00:00.000Z'
      })
    ).rejects.toMatchObject({ code: 'SLOT_OVERLAP' })
  })

  it('returns user-visible Slots with bookable derived from cutoff, frozen state and occupancy', async () => {
    const suffix = `p3-availability-${crypto.randomUUID()}`
    const ids = await seedBookingFixture(suffix)
    const now = Date.now()

    const cases = [
      { id: `slot_open_${suffix}`, start: now + 3 * 60 * 60_000, end: now + 4 * 60 * 60_000, status: 'open' },
      { id: `slot_cutoff_${suffix}`, start: now + 30 * 60_000, end: now + 50 * 60_000, status: 'open' },
      { id: `slot_frozen_${suffix}`, start: now + 5 * 60 * 60_000, end: now + 6 * 60 * 60_000, status: 'frozen' },
      { id: `slot_booked_${suffix}`, start: now + 7 * 60 * 60_000, end: now + 8 * 60 * 60_000, status: 'open' }
    ]

    for (const item of cases) {
      await insertSlot(ids, {
        id: item.id,
        startAt: item.start,
        endAt: item.end,
        status: item.status,
        localDate: localDate(item.start)
      })
    }
    await insertBooking(ids, {
      id: `booking_${suffix}`,
      slotId: `slot_booked_${suffix}`
    })

    const issued = await issueUserToken(ids.user, env.USER_TOKEN_SECRET)
    const dates = cases.map((item) => localDate(item.start)).sort()
    const response = await userRequest(
      `/v1/spaces/${ids.space}/resources/${ids.resource}/slots?from=${dates[0]}&to=${dates[dates.length - 1]}`,
      issued.accessToken
    )

    expect(response.status).toBe(200)
    const slots = (await response.json()).data
    const byId = new Map(slots.map((slot) => [slot.id, slot]))

    expect(byId.get(`slot_open_${suffix}`)).toMatchObject({
      bookable: true,
      slotType: {
        id: ids.slotType,
        name: `Synthetic Type ${suffix}`
      }
    })
    expect(byId.get(`slot_cutoff_${suffix}`)?.bookable).toBe(false)
    expect(byId.get(`slot_frozen_${suffix}`)?.bookable).toBe(false)
    expect(byId.get(`slot_booked_${suffix}`)?.bookable).toBe(false)
  })

  it.todo('single scope converts one Series occurrence into an exception (#26)')
  it.todo('this_and_future splits a Series without rewriting history (#26)')
  it.todo('entire_series recalculates future unbooked occurrences only (#26)')
  it.todo('returns SERIES_BOOKING_CONFLICT for booked occurrences affected by bulk edits (#26)')
})
