import type { Booking, BookingStatus, CutoffMinutes, SlotStatus } from '@yuke/shared'
import type { D1StatementLike } from '../../resource/catalog/repository'

export type BookingDatabase = {
  prepare(query: string): D1StatementLike
}

export type BookingCreationContext = {
  slotId: string
  startAt: number
  slotStatus: SlotStatus
  resourceStatus: 'active' | 'inactive'
  spaceStatus: 'active' | 'disabled'
  bookingCutoffMinutes: CutoffMinutes
  occupied: boolean
}

type BookingContextRow = {
  slot_id: string
  start_at: number
  slot_status: SlotStatus
  resource_status: 'active' | 'inactive'
  space_status: 'active' | 'disabled'
  booking_cutoff_minutes: CutoffMinutes
  occupied: number
}

type BookingRow = {
  id: string
  space_id: string
  slot_id: string
  participant_id: string
  status: BookingStatus
  created_at: number
  updated_at: number
}

type MutationResult = {
  meta?: {
    changes?: number
  }
}

function mapBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    spaceId: row.space_id,
    slotId: row.slot_id,
    participantId: row.participant_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

export async function findBookingCreationContext(
  db: BookingDatabase,
  spaceId: string,
  slotId: string
): Promise<BookingCreationContext | null> {
  const row = await db.prepare(`
    SELECT slots.id AS slot_id,
           slots.start_at,
           slots.status AS slot_status,
           resources.status AS resource_status,
           spaces.status AS space_status,
           space_settings.booking_cutoff_minutes,
           EXISTS (
             SELECT 1
             FROM bookings
             WHERE bookings.slot_id = slots.id
               AND bookings.status IN ('booked', 'completed')
           ) AS occupied
    FROM slots
    JOIN resources
      ON resources.id = slots.resource_id
     AND resources.space_id = slots.space_id
    JOIN spaces
      ON spaces.id = slots.space_id
    JOIN space_settings
      ON space_settings.space_id = spaces.id
    WHERE slots.id = ?
      AND slots.space_id = ?
    LIMIT 1
  `).bind(slotId, spaceId).first<BookingContextRow>()

  return row
    ? {
        slotId: row.slot_id,
        startAt: row.start_at,
        slotStatus: row.slot_status,
        resourceStatus: row.resource_status,
        spaceStatus: row.space_status,
        bookingCutoffMinutes: row.booking_cutoff_minutes,
        occupied: row.occupied === 1
      }
    : null
}

export async function insertBookingIfEligible(
  db: BookingDatabase,
  input: {
    id: string
    spaceId: string
    slotId: string
    membershipId: string
    participantId: string
    userId: string
    now: number
  }
): Promise<boolean> {
  const result = await db.prepare(`
    INSERT INTO bookings (
      id,
      space_id,
      slot_id,
      membership_id,
      participant_id,
      status,
      cancelled_at,
      completed_at,
      created_at,
      updated_at
    )
    SELECT ?,
           slots.space_id,
           slots.id,
           space_memberships.id,
           participants.id,
           'booked',
           NULL,
           NULL,
           ?,
           ?
    FROM slots
    JOIN spaces
      ON spaces.id = slots.space_id
    JOIN space_settings
      ON space_settings.space_id = spaces.id
    JOIN resources
      ON resources.id = slots.resource_id
     AND resources.space_id = slots.space_id
    JOIN space_memberships
      ON space_memberships.id = ?
     AND space_memberships.space_id = slots.space_id
     AND space_memberships.user_id = ?
    JOIN participants
      ON participants.id = ?
     AND participants.membership_id = space_memberships.id
     AND participants.space_id = slots.space_id
    WHERE slots.id = ?
      AND slots.space_id = ?
      AND slots.status = 'open'
      AND spaces.status = 'active'
      AND resources.status = 'active'
      AND space_memberships.status = 'active'
      AND participants.status = 'active'
      AND slots.start_at > ?
      AND (
        space_settings.booking_cutoff_minutes IS NULL
        OR ? < slots.start_at - space_settings.booking_cutoff_minutes * 60000
      )
  `).bind(
    input.id,
    input.now,
    input.now,
    input.membershipId,
    input.userId,
    input.participantId,
    input.slotId,
    input.spaceId,
    input.now,
    input.now
  ).run() as MutationResult

  return (result.meta?.changes ?? 0) > 0
}

export async function findBookingById(
  db: BookingDatabase,
  spaceId: string,
  bookingId: string
): Promise<Booking | null> {
  const row = await db.prepare(`
    SELECT id,
           space_id,
           slot_id,
           participant_id,
           status,
           created_at,
           updated_at
    FROM bookings
    WHERE id = ?
      AND space_id = ?
    LIMIT 1
  `).bind(bookingId, spaceId).first<BookingRow>()

  return row ? mapBooking(row) : null
}
