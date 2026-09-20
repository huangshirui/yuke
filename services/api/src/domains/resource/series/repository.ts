import type { CreateSlotSeriesInput, IsoWeekday, SlotSeriesStatus } from '@yuke/shared'
import type { D1StatementLike } from '../catalog/repository'

export type SeriesDatabase = {
  prepare(query: string): D1StatementLike
  batch(statements: D1StatementLike[]): Promise<unknown[]>
}

export type SlotSeriesRecord = {
  id: string
  spaceId: string
  resourceId: string
  slotTypeId: string
  timezone: string
  localStartTime: string
  localEndTime: string
  startsOn: string
  endsOn: string | null
  status: SlotSeriesStatus
  supersedesSeriesId: string | null
  createdByAdminId: string
  weekdays: IsoWeekday[]
}

type SeriesRow = {
  id: string
  space_id: string
  resource_id: string
  slot_type_id: string
  timezone: string
  local_start_time: string
  local_end_time: string
  starts_on: string
  ends_on: string | null
  status: SlotSeriesStatus
  supersedes_series_id: string | null
  created_by_admin_id: string
}

type WeekdayRow = { weekday: IsoWeekday }

function mapSeries(row: SeriesRow, weekdays: IsoWeekday[]): SlotSeriesRecord {
  return {
    id: row.id,
    spaceId: row.space_id,
    resourceId: row.resource_id,
    slotTypeId: row.slot_type_id,
    timezone: row.timezone,
    localStartTime: row.local_start_time,
    localEndTime: row.local_end_time,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: row.status,
    supersedesSeriesId: row.supersedes_series_id,
    createdByAdminId: row.created_by_admin_id,
    weekdays
  }
}

async function weekdaysFor(db: SeriesDatabase, seriesId: string): Promise<IsoWeekday[]> {
  const result = await db
    .prepare('SELECT weekday FROM slot_series_weekdays WHERE series_id = ? ORDER BY weekday ASC')
    .bind(seriesId)
    .all<WeekdayRow>()
  return (result.results ?? []).map((row) => row.weekday)
}

export async function insertSeries(
  db: SeriesDatabase,
  input: {
    id: string
    spaceId: string
    timezone: string
    adminId: string
    rule: CreateSlotSeriesInput
    now: number
  }
): Promise<void> {
  const statements: D1StatementLike[] = [
    db.prepare(`
      INSERT INTO slot_series (
        id, space_id, resource_id, slot_type_id, timezone,
        local_start_time, local_end_time, starts_on, ends_on,
        status, created_by_admin_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(
      input.id,
      input.spaceId,
      input.rule.resourceId,
      input.rule.slotTypeId,
      input.timezone,
      input.rule.localStartTime,
      input.rule.localEndTime,
      input.rule.startsOn,
      input.rule.endsOn,
      input.adminId,
      input.now,
      input.now
    )
  ]
  for (const weekday of input.rule.weekdays) {
    statements.push(
      db.prepare('INSERT INTO slot_series_weekdays (series_id, weekday) VALUES (?, ?)')
        .bind(input.id, weekday)
    )
  }
  await db.batch(statements)
}

export async function findSeriesById(
  db: SeriesDatabase,
  spaceId: string,
  seriesId: string
): Promise<SlotSeriesRecord | null> {
  const row = await db.prepare(`
    SELECT id, space_id, resource_id, slot_type_id, timezone,
           local_start_time, local_end_time, starts_on, ends_on,
           status, supersedes_series_id, created_by_admin_id
    FROM slot_series
    WHERE id = ? AND space_id = ?
    LIMIT 1
  `).bind(seriesId, spaceId).first<SeriesRow>()
  if (!row) return null
  return mapSeries(row, await weekdaysFor(db, row.id))
}

export async function listActiveSeriesForRange(
  db: SeriesDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<SlotSeriesRecord[]> {
  const result = await db.prepare(`
    SELECT id, space_id, resource_id, slot_type_id, timezone,
           local_start_time, local_end_time, starts_on, ends_on,
           status, supersedes_series_id, created_by_admin_id
    FROM slot_series
    WHERE space_id = ?
      AND resource_id = ?
      AND status = 'active'
      AND starts_on <= ?
      AND (ends_on IS NULL OR ends_on >= ?)
    ORDER BY starts_on ASC, id ASC
  `).bind(spaceId, resourceId, to, from).all<SeriesRow>()

  const records: SlotSeriesRecord[] = []
  for (const row of result.results ?? []) {
    records.push(mapSeries(row, await weekdaysFor(db, row.id)))
  }
  return records
}

export async function findSpaceTimezone(
  db: SeriesDatabase,
  spaceId: string
): Promise<string | null> {
  const row = await db.prepare(
    'SELECT timezone FROM spaces WHERE id = ? LIMIT 1'
  ).bind(spaceId).first<{ timezone: string }>()
  return row?.timezone ?? null
}

export async function occurrenceExists(
  db: SeriesDatabase,
  seriesId: string,
  date: string
): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 AS found
    FROM slots
    WHERE series_id = ? AND series_occurrence_date = ?
    LIMIT 1
  `).bind(seriesId, date).first<{ found: number }>()
  return row?.found === 1
}

export async function insertSeriesOccurrence(
  db: SeriesDatabase,
  input: {
    id: string
    series: SlotSeriesRecord
    date: string
    startAt: number
    endAt: number
    now: number
  }
): Promise<void> {
  await db.prepare(`
    INSERT INTO slots (
      id, space_id, resource_id, slot_type_id,
      series_id, series_occurrence_date, is_series_exception,
      start_at, end_at, local_date, status,
      created_by_admin_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?, ?, ?)
  `).bind(
    input.id,
    input.series.spaceId,
    input.series.resourceId,
    input.series.slotTypeId,
    input.series.id,
    input.date,
    input.startAt,
    input.endAt,
    input.date,
    input.series.createdByAdminId,
    input.now,
    input.now
  ).run()
}

export async function listConcreteSlotsByLocalDateRange(
  db: SeriesDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<Array<{
  id: string
  spaceId: string
  resourceId: string
  slotTypeId: string
  seriesId: string | null
  startAt: string
  endAt: string
  localDate: string
  status: 'open' | 'frozen' | 'cancelled'
  bookable: boolean
}>> {
  const result = await db.prepare(`
    SELECT slots.id, slots.space_id, slots.resource_id, slots.slot_type_id,
           slots.series_id, slots.start_at, slots.end_at, slots.local_date, slots.status,
           EXISTS (
             SELECT 1 FROM bookings
             WHERE bookings.slot_id = slots.id
               AND bookings.status IN ('booked', 'completed')
           ) AS occupied
    FROM slots
    WHERE slots.space_id = ?
      AND slots.resource_id = ?
      AND slots.local_date >= ?
      AND slots.local_date <= ?
    ORDER BY slots.start_at ASC, slots.id ASC
  `).bind(spaceId, resourceId, from, to).all<{
    id: string
    space_id: string
    resource_id: string
    slot_type_id: string
    series_id: string | null
    start_at: number
    end_at: number
    local_date: string
    status: 'open' | 'frozen' | 'cancelled'
    occupied: number
  }>()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    spaceId: row.space_id,
    resourceId: row.resource_id,
    slotTypeId: row.slot_type_id,
    seriesId: row.series_id,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    localDate: row.local_date,
    status: row.status,
    bookable: row.status === 'open' && row.occupied === 0
  }))
}
