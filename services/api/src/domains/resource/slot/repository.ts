import type { AdminSlot, Slot } from '@yuke/shared'
import type { D1StatementLike } from '../catalog/repository'

export type SlotDatabase = {
  prepare(query: string): D1StatementLike
}

export type SlotRecord = Slot & {
  seriesOccurrenceDate: string | null
  isSeriesException: boolean
}

export type AdminSlotRecord = AdminSlot & {
  seriesOccurrenceDate: string | null
  isSeriesException: boolean
}

type SlotRow = {
  id: string
  space_id: string
  resource_id: string
  slot_type_id: string
  series_id: string | null
  series_occurrence_date: string | null
  is_series_exception: number
  start_at: number
  end_at: number
  local_date: string
  status: Slot['status']
  occupied: number
}

function mapSlot(row: SlotRow): SlotRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    resourceId: row.resource_id,
    slotTypeId: row.slot_type_id,
    seriesId: row.series_id,
    seriesOccurrenceDate: row.series_occurrence_date,
    isSeriesException: row.is_series_exception === 1,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    localDate: row.local_date,
    status: row.status,
    bookable: row.status === 'open' && row.occupied === 0
  }
}



type AdminSlotRow = SlotRow & {
  booking_id: string | null
  booking_status: 'booked' | 'completed' | null
  booking_membership_id: string | null
  user_nickname: string | null
  booking_participant_id: string | null
  participant_name: string | null
}

function mapAdminSlot(row: AdminSlotRow): AdminSlotRecord {
  const slot = mapSlot(row)
  return {
    ...slot,
    booking: row.booking_id && row.booking_status && row.booking_membership_id &&
      row.booking_participant_id
      ? {
          id: row.booking_id,
          status: row.booking_status,
          membershipId: row.booking_membership_id,
          userNickname: row.user_nickname ?? '',
          participantId: row.booking_participant_id,
          participantName: row.participant_name ?? ''
        }
      : null
  }
}

const ADMIN_SLOT_SELECT = `
  SELECT slots.id,
         slots.space_id,
         slots.resource_id,
         slots.slot_type_id,
         slots.series_id,
         slots.series_occurrence_date,
         slots.is_series_exception,
         slots.start_at,
         slots.end_at,
         slots.local_date,
         slots.status,
         CASE WHEN active_booking.id IS NULL THEN 0 ELSE 1 END AS occupied,
         active_booking.id AS booking_id,
         active_booking.status AS booking_status,
         active_booking.membership_id AS booking_membership_id,
         users.nickname AS user_nickname,
         active_booking.participant_id AS booking_participant_id,
         participants.name AS participant_name
  FROM slots
  LEFT JOIN bookings AS active_booking
    ON active_booking.slot_id = slots.id
   AND active_booking.status IN ('booked', 'completed')
  LEFT JOIN space_memberships
    ON space_memberships.id = active_booking.membership_id
   AND space_memberships.space_id = slots.space_id
  LEFT JOIN users
    ON users.id = space_memberships.user_id
  LEFT JOIN participants
    ON participants.id = active_booking.participant_id
   AND participants.membership_id = active_booking.membership_id
   AND participants.space_id = slots.space_id
`

const SLOT_SELECT = `
  SELECT slots.id,
         slots.space_id,
         slots.resource_id,
         slots.slot_type_id,
         slots.series_id,
         slots.series_occurrence_date,
         slots.is_series_exception,
         slots.start_at,
         slots.end_at,
         slots.local_date,
         slots.status,
         EXISTS (
           SELECT 1 FROM bookings
           WHERE bookings.slot_id = slots.id
             AND bookings.status IN ('booked', 'completed')
         ) AS occupied
  FROM slots
`

export async function findSpaceTimezone(
  db: SlotDatabase,
  spaceId: string
): Promise<string | null> {
  const row = await db
    .prepare('SELECT timezone FROM spaces WHERE id = ? LIMIT 1')
    .bind(spaceId)
    .first<{ timezone: string }>()
  return row?.timezone ?? null
}

export async function findSlotById(
  db: SlotDatabase,
  spaceId: string,
  slotId: string
): Promise<SlotRecord | null> {
  const row = await db
    .prepare(`${SLOT_SELECT}
      WHERE slots.id = ? AND slots.space_id = ?
      LIMIT 1
    `)
    .bind(slotId, spaceId)
    .first<SlotRow>()
  return row ? mapSlot(row) : null
}

export async function listSlotsByResourceRange(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  startAt: number,
  endAt: number
): Promise<SlotRecord[]> {
  const result = await db
    .prepare(`${SLOT_SELECT}
      WHERE slots.space_id = ?
        AND slots.resource_id = ?
        AND slots.start_at < ?
        AND slots.end_at > ?
      ORDER BY slots.start_at ASC, slots.id ASC
    `)
    .bind(spaceId, resourceId, endAt, startAt)
    .all<SlotRow>()
  return (result.results ?? []).map(mapSlot)
}

export async function insertSlot(
  db: SlotDatabase,
  input: {
    id: string
    spaceId: string
    resourceId: string
    slotTypeId: string
    seriesId?: string | null
    seriesOccurrenceDate?: string | null
    isSeriesException?: boolean
    startAt: number
    endAt: number
    localDate: string
    status?: Slot['status']
    createdByAdminId: string
    now: number
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO slots (
        id, space_id, resource_id, slot_type_id,
        series_id, series_occurrence_date, is_series_exception,
        start_at, end_at, local_date, status,
        created_by_admin_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.id,
      input.spaceId,
      input.resourceId,
      input.slotTypeId,
      input.seriesId ?? null,
      input.seriesOccurrenceDate ?? null,
      input.isSeriesException ? 1 : 0,
      input.startAt,
      input.endAt,
      input.localDate,
      input.status ?? 'open',
      input.createdByAdminId,
      input.now,
      input.now
    )
    .run()
}

export async function updateSlot(
  db: SlotDatabase,
  input: {
    id: string
    spaceId: string
    slotTypeId: string
    startAt: number
    endAt: number
    localDate: string
    status: Slot['status']
    isSeriesException: boolean
    now: number
  }
): Promise<void> {
  await db
    .prepare(`
      UPDATE slots
      SET slot_type_id = ?,
          start_at = ?,
          end_at = ?,
          local_date = ?,
          status = ?,
          is_series_exception = ?,
          updated_at = ?
      WHERE id = ? AND space_id = ?
    `)
    .bind(
      input.slotTypeId,
      input.startAt,
      input.endAt,
      input.localDate,
      input.status,
      input.isSeriesException ? 1 : 0,
      input.now,
      input.id,
      input.spaceId
    )
    .run()
}

export async function listSlotsByLocalDateRange(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<SlotRecord[]> {
  const result = await db
    .prepare(`${SLOT_SELECT}
      WHERE slots.space_id = ?
        AND slots.resource_id = ?
        AND slots.local_date >= ?
        AND slots.local_date <= ?
      ORDER BY slots.start_at ASC, slots.id ASC
    `)
    .bind(spaceId, resourceId, from, to)
    .all<SlotRow>()
  return (result.results ?? []).map(mapSlot)
}


export async function listAdminSlotsByResourceRange(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  startAt: number,
  endAt: number
): Promise<AdminSlotRecord[]> {
  const result = await db
    .prepare(`${ADMIN_SLOT_SELECT}
      WHERE slots.space_id = ?
        AND slots.resource_id = ?
        AND slots.start_at < ?
        AND slots.end_at > ?
      ORDER BY slots.start_at ASC, slots.id ASC
    `)
    .bind(spaceId, resourceId, endAt, startAt)
    .all<AdminSlotRow>()
  return (result.results ?? []).map(mapAdminSlot)
}

export async function listAdminSlotsByLocalDateRange(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<AdminSlotRecord[]> {
  const result = await db
    .prepare(`${ADMIN_SLOT_SELECT}
      WHERE slots.space_id = ?
        AND slots.resource_id = ?
        AND slots.local_date >= ?
        AND slots.local_date <= ?
      ORDER BY slots.start_at ASC, slots.id ASC
    `)
    .bind(spaceId, resourceId, from, to)
    .all<AdminSlotRow>()
  return (result.results ?? []).map(mapAdminSlot)
}
