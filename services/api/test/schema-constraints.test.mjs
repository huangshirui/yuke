import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  NOW,
  insertBooking,
  insertSlot,
  seedBookingFixture
} from './helpers/d1-fixture.mjs'

describe('D1 schema contract', () => {
  it('enforces Participant YYYY-MM and fixed Space cutoff values', async () => {
    const ids = await seedBookingFixture('contract')

    await expect(
      env.DB.prepare(`
        INSERT INTO participants
          (id, space_id, membership_id, name, birth_month, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        'par_invalid_month',
        ids.space,
        ids.membership,
        'Invalid Month Synthetic',
        '2012-13',
        'active',
        NOW,
        NOW
      ).run()
    ).rejects.toThrow(/CHECK constraint failed/)

    await expect(
      env.DB.prepare(`
        UPDATE space_settings
        SET booking_cutoff_minutes = 45
        WHERE space_id = ?
      `).bind(ids.space).run()
    ).rejects.toThrow(/CHECK constraint failed/)
  })

  it('treats open and frozen Slots as Resource time occupancy', async () => {
    const ids = await seedBookingFixture('overlap')

    await insertSlot(ids, {
      id: 'slot_primary',
      startAt: 10_000,
      endAt: 20_000
    })

    await expect(
      insertSlot(ids, {
        id: 'slot_overlap',
        startAt: 15_000,
        endAt: 18_000
      })
    ).rejects.toThrow(/SLOT_OVERLAP/)

    await insertSlot(ids, {
      id: 'slot_adjacent',
      startAt: 20_000,
      endAt: 25_000
    })

    await expect(
      insertSlot(ids, {
        id: 'slot_frozen_overlap',
        startAt: 24_000,
        endAt: 30_000,
        status: 'frozen'
      })
    ).rejects.toThrow(/SLOT_OVERLAP/)
  })

  it('enforces capacity=1 and releases occupancy after cancellation', async () => {
    const ids = await seedBookingFixture('capacity')

    await insertSlot(ids, {
      id: 'slot_capacity',
      startAt: 30_000,
      endAt: 40_000
    })
    await insertBooking(ids, {
      id: 'booking_first',
      slotId: 'slot_capacity'
    })

    await expect(
      insertBooking(ids, {
        id: 'booking_second',
        slotId: 'slot_capacity'
      })
    ).rejects.toThrow(/UNIQUE constraint failed: bookings\.slot_id/)

    await env.DB.prepare(`
      UPDATE bookings
      SET status = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(NOW + 100, NOW + 100, 'booking_first').run()

    await insertBooking(ids, {
      id: 'booking_second',
      slotId: 'slot_capacity'
    })

    const active = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE slot_id = ? AND status IN ('booked', 'completed')
    `).bind('slot_capacity').first()

    expect(active?.count).toBe(1)
  })

  it('rejects new Bookings on frozen Slots', async () => {
    const ids = await seedBookingFixture('frozen')

    await insertSlot(ids, {
      id: 'slot_frozen',
      startAt: 50_000,
      endAt: 60_000,
      status: 'frozen'
    })

    await expect(
      insertBooking(ids, {
        id: 'booking_frozen',
        slotId: 'slot_frozen'
      })
    ).rejects.toThrow(/SLOT_NOT_BOOKABLE/)
  })

  it('does not allow a Slot with an active Booking to be cancelled directly', async () => {
    const ids = await seedBookingFixture('active-booking')

    await insertSlot(ids, {
      id: 'slot_with_booking',
      startAt: 70_000,
      endAt: 80_000
    })
    await insertBooking(ids, {
      id: 'booking_active',
      slotId: 'slot_with_booking'
    })

    await expect(
      env.DB.prepare('UPDATE slots SET status = ? WHERE id = ?')
        .bind('cancelled', 'slot_with_booking')
        .run()
    ).rejects.toThrow(/SLOT_HAS_ACTIVE_BOOKING/)
  })
})
