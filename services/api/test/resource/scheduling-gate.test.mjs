import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { NOW, insertSlot, seedBookingFixture } from '../helpers/d1-fixture.mjs'

async function insertSeries(ids, suffix = 'gate') {
  const seriesId = `series_${suffix}_${crypto.randomUUID()}`
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO slot_series (
        id, space_id, resource_id, slot_type_id, timezone,
        local_start_time, local_end_time, starts_on, ends_on,
        status, created_by_admin_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'Asia/Shanghai', '09:00', '12:00', '2026-09-21', NULL,
              'active', ?, ?, ?)
    `).bind(seriesId, ids.space, ids.resource, ids.slotType, ids.admin, NOW, NOW),
    env.DB.prepare(`
      INSERT INTO slot_series_weekdays (series_id, weekday)
      VALUES (?, 1)
    `).bind(seriesId)
  ])
  return seriesId
}

describe('Scheduling Gate / Phase 3', () => {
  it('rejects overlapping open and frozen Slots while allowing adjacent ranges', async () => {
    const ids = await seedBookingFixture(`p3-overlap-${crypto.randomUUID()}`)
    await insertSlot(ids, {
      id: `slot_primary_${crypto.randomUUID()}`,
      startAt: 1_000_000,
      endAt: 2_000_000,
      localDate: '2026-09-21'
    })

    await expect(
      insertSlot(ids, {
        id: `slot_overlap_${crypto.randomUUID()}`,
        startAt: 1_500_000,
        endAt: 1_800_000,
        localDate: '2026-09-21'
      })
    ).rejects.toThrow(/SLOT_OVERLAP/)

    await expect(
      insertSlot(ids, {
        id: `slot_frozen_${crypto.randomUUID()}`,
        startAt: 1_900_000,
        endAt: 2_300_000,
        localDate: '2026-09-21',
        status: 'frozen'
      })
    ).rejects.toThrow(/SLOT_OVERLAP/)

    await insertSlot(ids, {
      id: `slot_adjacent_${crypto.randomUUID()}`,
      startAt: 2_000_000,
      endAt: 2_500_000,
      localDate: '2026-09-21'
    })
  })

  it('provides the database idempotency key for a materialized Series occurrence', async () => {
    const ids = await seedBookingFixture(`p3-series-${crypto.randomUUID()}`)
    const seriesId = await insertSeries(ids)
    const date = '2026-09-21'

    await env.DB.prepare(`
      INSERT INTO slots (
        id, space_id, resource_id, slot_type_id,
        series_id, series_occurrence_date, is_series_exception,
        start_at, end_at, local_date, status,
        created_by_admin_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?, ?, ?)
    `).bind(
      `slot_series_first_${crypto.randomUUID()}`,
      ids.space,
      ids.resource,
      ids.slotType,
      seriesId,
      date,
      10_000_000,
      11_000_000,
      date,
      ids.admin,
      NOW,
      NOW
    ).run()

    await expect(
      env.DB.prepare(`
        INSERT INTO slots (
          id, space_id, resource_id, slot_type_id,
          series_id, series_occurrence_date, is_series_exception,
          start_at, end_at, local_date, status,
          created_by_admin_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?, ?, ?)
      `).bind(
        `slot_series_second_${crypto.randomUUID()}`,
        ids.space,
        ids.resource,
        ids.slotType,
        seriesId,
        date,
        12_000_000,
        13_000_000,
        date,
        ids.admin,
        NOW,
        NOW
      ).run()
    ).rejects.toThrow(/UNIQUE constraint failed: slots\.series_id, slots\.series_occurrence_date/)
  })

  it.todo('materializes the same requested Series window idempotently via ensureSeriesMaterialized (#25 integration)')
  it.todo('single scope converts one occurrence into a Series exception (#26)')
  it.todo('this_and_future splits a Series without rewriting history (#26)')
  it.todo('entire_series recalculates future unbooked occurrences only (#26)')
  it.todo('returns SERIES_BOOKING_CONFLICT for booked occurrences affected by bulk Series edits (#26)')
})
