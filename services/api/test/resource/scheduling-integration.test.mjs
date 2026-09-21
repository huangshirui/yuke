import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { issueUserToken } from '../../src/domains/identity/token'
import {
  changeAdminSingleSlot,
  createAdminSlot,
  listAdminSlotsByLocalDateRange
} from '../../src/domains/resource/slot/service'
import {
  createAdminSlotSeries,
  editAdminSlotSeriesFromOccurrence,
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

  it('projects the occupying Booking onto Admin calendar Slots', async () => {
    const suffix = `p3-admin-projection-${crypto.randomUUID()}`
    const ids = await seedBookingFixture(suffix)
    const start = Date.parse('2026-09-23T02:00:00.000Z')
    const slotId = `slot_admin_projection_${suffix}`
    const bookingId = `booking_admin_projection_${suffix}`

    await insertSlot(ids, {
      id: slotId,
      startAt: start,
      endAt: start + 30 * 60_000,
      status: 'open',
      localDate: '2026-09-23'
    })
    await insertBooking(ids, { id: bookingId, slotId })

    const slots = await listAdminSlotsByLocalDateRange(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-23',
      '2026-09-23'
    )

    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({
      id: slotId,
      bookable: false,
      booking: {
        id: bookingId,
        status: 'booked',
        membershipId: ids.membership,
        userNickname: `Synthetic User ${suffix}`,
        participantId: ids.participant,
        participantName: `Synthetic Participant ${suffix}`
      }
    })
  })

  it('single scope converts only the selected occurrence into a persistent exception', async () => {
    const ids = await seedBookingFixture(`p3-single-${crypto.randomUUID()}`)
    const series = await createAdminSlotSeries(env.DB, ids.space, ids.admin, {
      resourceId: ids.resource,
      slotTypeId: ids.slotType,
      weekdays: [1],
      localStartTime: '09:00',
      localEndTime: '12:00',
      startsOn: '2026-09-21',
      endsOn: null
    })
    await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-21',
      '2026-10-05'
    )

    const anchor = await env.DB.prepare(`
      SELECT id
      FROM slots
      WHERE series_id = ? AND series_occurrence_date = '2026-09-28'
    `).bind(series.id).first()

    await changeAdminSingleSlot(env.DB, ids.space, anchor.id, {
      scope: 'single',
      startAt: '2026-09-28T02:00:00.000Z',
      endAt: '2026-09-28T05:00:00.000Z'
    })

    const rows = await env.DB.prepare(`
      SELECT series_occurrence_date, is_series_exception, start_at, end_at
      FROM slots
      WHERE series_id = ?
      ORDER BY series_occurrence_date
    `).bind(series.id).all()

    expect(rows.results).toHaveLength(3)
    expect(rows.results[0]).toMatchObject({
      series_occurrence_date: '2026-09-21',
      is_series_exception: 0
    })
    expect(rows.results[1]).toMatchObject({
      series_occurrence_date: '2026-09-28',
      is_series_exception: 1,
      start_at: Date.parse('2026-09-28T02:00:00.000Z'),
      end_at: Date.parse('2026-09-28T05:00:00.000Z')
    })
    expect(rows.results[2]).toMatchObject({
      series_occurrence_date: '2026-10-05',
      is_series_exception: 0
    })

    expect(
      await ensureSeriesMaterialized(
        env.DB,
        ids.space,
        ids.resource,
        '2026-09-28',
        '2026-09-28'
      )
    ).toBe(0)
  })

  it('this_and_future splits the Series and preserves occurrences before the anchor', async () => {
    const ids = await seedBookingFixture(`p3-split-${crypto.randomUUID()}`)
    const series = await createAdminSlotSeries(env.DB, ids.space, ids.admin, {
      resourceId: ids.resource,
      slotTypeId: ids.slotType,
      weekdays: [1],
      localStartTime: '09:00',
      localEndTime: '12:00',
      startsOn: '2026-09-21',
      endsOn: null
    })
    await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-21',
      '2026-10-12'
    )

    const anchor = await env.DB.prepare(`
      SELECT id
      FROM slots
      WHERE series_id = ? AND series_occurrence_date = '2026-09-28'
    `).bind(series.id).first()

    const result = await editAdminSlotSeriesFromOccurrence(
      env.DB,
      ids.space,
      anchor.id,
      ids.admin,
      {
        scope: 'this_and_future',
        weekdays: [2],
        localStartTime: '10:00',
        localEndTime: '11:00',
        endsOn: null
      },
      Date.parse('2026-09-20T00:00:00.000Z')
    )

    expect(result.scope).toBe('this_and_future')
    expect(result.series.supersedesSeriesId).toBe(series.id)
    expect(result.series.startsOn).toBe('2026-09-28')
    expect(result.series.weekdays).toEqual([2])

    const oldSeries = await env.DB.prepare(`
      SELECT ends_on, status
      FROM slot_series
      WHERE id = ?
    `).bind(series.id).first()
    expect(oldSeries).toMatchObject({ ends_on: '2026-09-27', status: 'active' })

    const oldSlots = await env.DB.prepare(`
      SELECT local_date, status, series_id
      FROM slots
      WHERE local_date IN ('2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12')
      ORDER BY local_date, status
    `).all()

    expect(
      oldSlots.results.find((row) => row.local_date === '2026-09-21' && row.series_id === series.id)
    ).toMatchObject({ status: 'open' })
    for (const date of ['2026-09-28', '2026-10-05', '2026-10-12']) {
      expect(
        oldSlots.results.find((row) => row.local_date === date && row.series_id === null)
      ).toMatchObject({ status: 'cancelled' })
    }

    const replacementSlots = await env.DB.prepare(`
      SELECT local_date, start_at, end_at, status
      FROM slots
      WHERE series_id = ?
      ORDER BY local_date
    `).bind(result.series.id).all()

    expect(replacementSlots.results.map((row) => row.local_date)).toEqual([
      '2026-09-29',
      '2026-10-06'
    ])
    expect(replacementSlots.results[0]).toMatchObject({
      start_at: Date.parse('2026-09-29T02:00:00.000Z'),
      end_at: Date.parse('2026-09-29T03:00:00.000Z'),
      status: 'open'
    })

    expect(
      await ensureSeriesMaterialized(
        env.DB,
        ids.space,
        ids.resource,
        '2026-10-13',
        '2026-10-13'
      )
    ).toBe(1)
  })

  it('entire_series keeps past Slots unchanged and never backfills history with the revised rule', async () => {
    const ids = await seedBookingFixture(`p3-entire-${crypto.randomUUID()}`)
    const series = await createAdminSlotSeries(env.DB, ids.space, ids.admin, {
      resourceId: ids.resource,
      slotTypeId: ids.slotType,
      weekdays: [1],
      localStartTime: '09:00',
      localEndTime: '12:00',
      startsOn: '2026-09-07',
      endsOn: null
    })
    await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-07',
      '2026-10-05'
    )

    const anchor = await env.DB.prepare(`
      SELECT id
      FROM slots
      WHERE series_id = ? AND series_occurrence_date = '2026-09-28'
    `).bind(series.id).first()

    const revisionAt = Date.parse('2026-09-22T00:30:00.000Z')
    const result = await editAdminSlotSeriesFromOccurrence(
      env.DB,
      ids.space,
      anchor.id,
      ids.admin,
      {
        scope: 'entire_series',
        weekdays: [4],
        localStartTime: '14:00',
        localEndTime: '15:00'
      },
      revisionAt
    )

    expect(result.series.id).toBe(series.id)
    expect(result.series.weekdays).toEqual([4])

    const revisedSeries = await env.DB.prepare(`
      SELECT materialize_after_at
      FROM slot_series
      WHERE id = ?
    `).bind(series.id).first()
    expect(revisedSeries.materialize_after_at).toBe(revisionAt)

    const past = await env.DB.prepare(`
      SELECT local_date, start_at, series_id, status
      FROM slots
      WHERE series_id = ?
        AND local_date IN ('2026-09-07', '2026-09-14', '2026-09-21')
      ORDER BY local_date
    `).bind(series.id).all()

    expect(past.results).toHaveLength(3)
    expect(past.results.every((row) => row.series_id === series.id && row.status === 'open')).toBe(true)
    expect(past.results[2].start_at).toBe(Date.parse('2026-09-21T01:00:00.000Z'))

    const revised = await env.DB.prepare(`
      SELECT local_date, start_at, end_at
      FROM slots
      WHERE series_id = ? AND local_date >= '2026-09-22'
      ORDER BY local_date
    `).bind(series.id).all()

    expect(revised.results.map((row) => row.local_date)).toEqual([
      '2026-09-24',
      '2026-10-01'
    ])
    expect(revised.results[0]).toMatchObject({
      start_at: Date.parse('2026-09-24T06:00:00.000Z'),
      end_at: Date.parse('2026-09-24T07:00:00.000Z')
    })

    expect(
      await ensureSeriesMaterialized(
        env.DB,
        ids.space,
        ids.resource,
        '2026-09-17',
        '2026-09-17'
      )
    ).toBe(0)
    const historicalBackfill = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM slots
      WHERE series_id = ? AND local_date = '2026-09-17'
    `).bind(series.id).first()
    expect(historicalBackfill.count).toBe(0)

    expect(
      await ensureSeriesMaterialized(
        env.DB,
        ids.space,
        ids.resource,
        '2026-10-08',
        '2026-10-08'
      )
    ).toBe(1)
  })

  it('returns SERIES_BOOKING_CONFLICT and leaves the Series untouched when a bulk edit hits a Booking', async () => {
    const ids = await seedBookingFixture(`p3-conflict-${crypto.randomUUID()}`)
    const series = await createAdminSlotSeries(env.DB, ids.space, ids.admin, {
      resourceId: ids.resource,
      slotTypeId: ids.slotType,
      weekdays: [1],
      localStartTime: '09:00',
      localEndTime: '12:00',
      startsOn: '2026-09-21',
      endsOn: null
    })
    await ensureSeriesMaterialized(
      env.DB,
      ids.space,
      ids.resource,
      '2026-09-21',
      '2026-10-05'
    )

    const anchor = await env.DB.prepare(`
      SELECT id
      FROM slots
      WHERE series_id = ? AND series_occurrence_date = '2026-09-28'
    `).bind(series.id).first()
    const booked = await env.DB.prepare(`
      SELECT id
      FROM slots
      WHERE series_id = ? AND series_occurrence_date = '2026-10-05'
    `).bind(series.id).first()

    await insertBooking(ids, {
      id: `booking_p3_conflict_${crypto.randomUUID()}`,
      slotId: booked.id
    })

    await expect(
      editAdminSlotSeriesFromOccurrence(
        env.DB,
        ids.space,
        anchor.id,
        ids.admin,
        {
          scope: 'this_and_future',
          localStartTime: '10:00',
          localEndTime: '11:00'
        },
        Date.parse('2026-09-20T00:00:00.000Z')
      )
    ).rejects.toMatchObject({
      code: 'SERIES_BOOKING_CONFLICT',
      details: {
        conflicts: [
          expect.objectContaining({
            slotId: booked.id,
            localDate: '2026-10-05'
          })
        ]
      }
    })

    const saved = await env.DB.prepare(`
      SELECT ends_on, status
      FROM slot_series
      WHERE id = ?
    `).bind(series.id).first()
    expect(saved).toMatchObject({ ends_on: null, status: 'active' })

    const superseding = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM slot_series
      WHERE supersedes_series_id = ?
    `).bind(series.id).first()
    expect(superseding.count).toBe(0)

    const futureSlots = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM slots
      WHERE series_id = ?
        AND series_occurrence_date >= '2026-09-28'
        AND status = 'open'
    `).bind(series.id).first()
    expect(futureSlots.count).toBe(2)
  })
})
