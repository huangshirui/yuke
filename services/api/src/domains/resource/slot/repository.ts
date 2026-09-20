import type { Slot } from '@yuke/shared'
import type { D1StatementLike } from '../catalog/repository'

export type SlotDatabase = {
  prepare(query: string): D1StatementLike
}

export type SlotRecord = Slot & {
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
