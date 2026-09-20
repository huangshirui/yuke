import type { CutoffMinutes, SlotStatus } from '@yuke/shared'
import type { D1StatementLike } from '../catalog/repository'

export type AvailabilityDatabase = {
  prepare(query: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<unknown[]>
}

export type AvailabilitySlot = {
  id: string
  spaceId: string
  resourceId: string
  resource: { id: string; name: string }
  slotTypeId: string
  slotType: { id: string; name: string }
  seriesId: string | null
  startAt: string
  endAt: string
  localDate: string
  status: SlotStatus
  bookable: boolean
}

type AvailabilityContextRow = {
  space_status: 'active' | 'disabled'
  resource_status: 'active' | 'inactive'
  booking_cutoff_minutes: CutoffMinutes
}

type AvailabilityRow = {
  id: string
  space_id: string
  resource_id: string
  resource_name: string
  slot_type_id: string
  slot_type_name: string
  series_id: string | null
  start_at: number
  end_at: number
  local_date: string
  status: SlotStatus
  occupied: number
}

export async function getAvailabilityContext(
  db: AvailabilityDatabase,
  spaceId: string,
  resourceId: string
): Promise<AvailabilityContextRow | null> {
  return db.prepare(`
    SELECT spaces.status AS space_status,
           resources.status AS resource_status,
           space_settings.booking_cutoff_minutes
    FROM spaces
    JOIN resources
      ON resources.space_id = spaces.id
     AND resources.id = ?
    JOIN space_settings
      ON space_settings.space_id = spaces.id
    WHERE spaces.id = ?
    LIMIT 1
  `).bind(resourceId, spaceId).first<AvailabilityContextRow>()
}

export async function listAvailabilityRows(
  db: AvailabilityDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<AvailabilityRow[]> {
  const result = await db.prepare(`
    SELECT slots.id,
           slots.space_id,
           slots.resource_id,
           resources.name AS resource_name,
           slots.slot_type_id,
           slot_types.name AS slot_type_name,
           slots.series_id,
           slots.start_at,
           slots.end_at,
           slots.local_date,
           slots.status,
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
    JOIN slot_types
      ON slot_types.id = slots.slot_type_id
     AND slot_types.space_id = slots.space_id
    WHERE slots.space_id = ?
      AND slots.resource_id = ?
      AND slots.local_date >= ?
      AND slots.local_date <= ?
      AND slots.status != 'cancelled'
    ORDER BY slots.start_at ASC, slots.id ASC
  `).bind(spaceId, resourceId, from, to).all<AvailabilityRow>()

  return result.results ?? []
}

export function mapAvailabilitySlot(
  row: AvailabilityRow,
  context: AvailabilityContextRow,
  now: number
): AvailabilitySlot {
  const cutoff = context.booking_cutoff_minutes
  const beforeCutoff = cutoff === null || now < row.start_at - cutoff * 60_000
  const bookable =
    context.space_status === 'active' &&
    context.resource_status === 'active' &&
    row.status === 'open' &&
    row.occupied === 0 &&
    beforeCutoff

  return {
    id: row.id,
    spaceId: row.space_id,
    resourceId: row.resource_id,
    resource: { id: row.resource_id, name: row.resource_name },
    slotTypeId: row.slot_type_id,
    slotType: { id: row.slot_type_id, name: row.slot_type_name },
    seriesId: row.series_id,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    localDate: row.local_date,
    status: row.status,
    bookable
  }
}
