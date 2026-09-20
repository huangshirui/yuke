import type {
  CreateSlotSeriesInput,
  IsoWeekday,
  SlotSeriesStatus,
  SlotStatus
} from '@yuke/shared'
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
  materializeAfterAt: number | null
  status: SlotSeriesStatus
  supersedesSeriesId: string | null
  createdByAdminId: string
  weekdays: IsoWeekday[]
}

export type SeriesSlotForEdit = {
  id: string
  localDate: string
  startAt: number
  endAt: number
  status: SlotStatus
  bookingId: string | null
}

export type MaterializedOccurrenceInput = {
  id: string
  seriesId: string
  spaceId: string
  resourceId: string
  slotTypeId: string
  date: string
  startAt: number
  endAt: number
  createdByAdminId: string
}

export type SeriesRuleState = {
  slotTypeId: string
  localStartTime: string
  localEndTime: string
  startsOn: string
  endsOn: string | null
  materializeAfterAt: number | null
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
  materialize_after_at: number | null
  status: SlotSeriesStatus
  supersedes_series_id: string | null
  created_by_admin_id: string
}

type WeekdayRow = { weekday: IsoWeekday }

type SeriesSlotRow = {
  id: string
  local_date: string
  start_at: number
  end_at: number
  status: SlotStatus
  booking_id: string | null
}

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
    materializeAfterAt: row.materialize_after_at,
    status: row.status,
    supersedesSeriesId: row.supersedes_series_id,
    createdByAdminId: row.created_by_admin_id,
    weekdays
  }
}

function mapSeriesSlot(row: SeriesSlotRow): SeriesSlotForEdit {
  return {
    id: row.id,
    localDate: row.local_date,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    bookingId: row.booking_id
  }
}

async function weekdaysFor(db: SeriesDatabase, seriesId: string): Promise<IsoWeekday[]> {
  const result = await db
    .prepare('SELECT weekday FROM slot_series_weekdays WHERE series_id = ? ORDER BY weekday ASC')
    .bind(seriesId)
    .all<WeekdayRow>()
  return (result.results ?? []).map((row) => row.weekday)
}

function insertSeriesStatement(
  db: SeriesDatabase,
  input: {
    id: string
    spaceId: string
    resourceId: string
    slotTypeId: string
    timezone: string
    localStartTime: string
    localEndTime: string
    startsOn: string
    endsOn: string | null
    materializeAfterAt?: number | null
    status?: SlotSeriesStatus
    supersedesSeriesId?: string | null
    adminId: string
    now: number
  }
): D1StatementLike {
  return db.prepare(`
    INSERT INTO slot_series (
      id, space_id, resource_id, slot_type_id, timezone,
      local_start_time, local_end_time, starts_on, ends_on,
      materialize_after_at, status, supersedes_series_id,
      created_by_admin_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    input.spaceId,
    input.resourceId,
    input.slotTypeId,
    input.timezone,
    input.localStartTime,
    input.localEndTime,
    input.startsOn,
    input.endsOn,
    input.materializeAfterAt ?? null,
    input.status ?? 'active',
    input.supersedesSeriesId ?? null,
    input.adminId,
    input.now,
    input.now
  )
}

function insertOccurrenceStatement(
  db: SeriesDatabase,
  occurrence: MaterializedOccurrenceInput,
  now: number
): D1StatementLike {
  return db.prepare(`
    INSERT INTO slots (
      id, space_id, resource_id, slot_type_id,
      series_id, series_occurrence_date, is_series_exception,
      start_at, end_at, local_date, status,
      created_by_admin_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'open', ?, ?, ?)
  `).bind(
    occurrence.id,
    occurrence.spaceId,
    occurrence.resourceId,
    occurrence.slotTypeId,
    occurrence.seriesId,
    occurrence.date,
    occurrence.startAt,
    occurrence.endAt,
    occurrence.date,
    occurrence.createdByAdminId,
    now,
    now
  )
}

function retireSlotStatement(
  db: SeriesDatabase,
  slotId: string,
  seriesId: string,
  now: number
): D1StatementLike {
  return db.prepare(`
    UPDATE slots
    SET status = 'cancelled',
        series_id = NULL,
        series_occurrence_date = NULL,
        is_series_exception = 1,
        updated_at = ?
    WHERE id = ? AND series_id = ?
  `).bind(now, slotId, seriesId)
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
    supersedesSeriesId?: string | null
    materializeAfterAt?: number | null
  }
): Promise<void> {
  const statements: D1StatementLike[] = [
    insertSeriesStatement(db, {
      id: input.id,
      spaceId: input.spaceId,
      resourceId: input.rule.resourceId,
      slotTypeId: input.rule.slotTypeId,
      timezone: input.timezone,
      localStartTime: input.rule.localStartTime,
      localEndTime: input.rule.localEndTime,
      startsOn: input.rule.startsOn,
      endsOn: input.rule.endsOn,
      materializeAfterAt: input.materializeAfterAt,
      supersedesSeriesId: input.supersedesSeriesId,
      adminId: input.adminId,
      now: input.now
    })
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
           materialize_after_at, status, supersedes_series_id, created_by_admin_id
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
           materialize_after_at, status, supersedes_series_id, created_by_admin_id
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
  await insertOccurrenceStatement(db, {
    id: input.id,
    seriesId: input.series.id,
    spaceId: input.series.spaceId,
    resourceId: input.series.resourceId,
    slotTypeId: input.series.slotTypeId,
    date: input.date,
    startAt: input.startAt,
    endAt: input.endAt,
    createdByAdminId: input.series.createdByAdminId
  }, input.now).run()
}

export async function listSeriesSlotsFromOccurrenceDate(
  db: SeriesDatabase,
  seriesId: string,
  fromDate: string
): Promise<SeriesSlotForEdit[]> {
  const result = await db.prepare(`
    SELECT slots.id,
           slots.local_date,
           slots.start_at,
           slots.end_at,
           slots.status,
           (
             SELECT bookings.id
             FROM bookings
             WHERE bookings.slot_id = slots.id
               AND bookings.status IN ('booked', 'completed')
             LIMIT 1
           ) AS booking_id
    FROM slots
    WHERE slots.series_id = ?
      AND slots.series_occurrence_date >= ?
    ORDER BY slots.start_at ASC, slots.id ASC
  `).bind(seriesId, fromDate).all<SeriesSlotRow>()
  return (result.results ?? []).map(mapSeriesSlot)
}

export async function listSeriesSlotsStartingAtOrAfter(
  db: SeriesDatabase,
  seriesId: string,
  startAt: number
): Promise<SeriesSlotForEdit[]> {
  const result = await db.prepare(`
    SELECT slots.id,
           slots.local_date,
           slots.start_at,
           slots.end_at,
           slots.status,
           (
             SELECT bookings.id
             FROM bookings
             WHERE bookings.slot_id = slots.id
               AND bookings.status IN ('booked', 'completed')
             LIMIT 1
           ) AS booking_id
    FROM slots
    WHERE slots.series_id = ?
      AND slots.start_at >= ?
    ORDER BY slots.start_at ASC, slots.id ASC
  `).bind(seriesId, startAt).all<SeriesSlotRow>()
  return (result.results ?? []).map(mapSeriesSlot)
}

export async function applySplitSeriesEdit(
  db: SeriesDatabase,
  input: {
    current: SlotSeriesRecord
    oldEndsOn: string
    replacement: SlotSeriesRecord
    affectedSlotIds: string[]
    occurrences: MaterializedOccurrenceInput[]
    now: number
  }
): Promise<void> {
  const statements: D1StatementLike[] = [
    db.prepare(`
      UPDATE slot_series
      SET ends_on = ?, updated_at = ?
      WHERE id = ? AND space_id = ?
    `).bind(input.oldEndsOn, input.now, input.current.id, input.current.spaceId),
    insertSeriesStatement(db, {
      id: input.replacement.id,
      spaceId: input.replacement.spaceId,
      resourceId: input.replacement.resourceId,
      slotTypeId: input.replacement.slotTypeId,
      timezone: input.replacement.timezone,
      localStartTime: input.replacement.localStartTime,
      localEndTime: input.replacement.localEndTime,
      startsOn: input.replacement.startsOn,
      endsOn: input.replacement.endsOn,
      materializeAfterAt: input.replacement.materializeAfterAt,
      status: 'active',
      supersedesSeriesId: input.current.id,
      adminId: input.replacement.createdByAdminId,
      now: input.now
    })
  ]

  for (const weekday of input.replacement.weekdays) {
    statements.push(
      db.prepare('INSERT INTO slot_series_weekdays (series_id, weekday) VALUES (?, ?)')
        .bind(input.replacement.id, weekday)
    )
  }
  for (const slotId of input.affectedSlotIds) {
    statements.push(retireSlotStatement(db, slotId, input.current.id, input.now))
  }
  for (const occurrence of input.occurrences) {
    statements.push(insertOccurrenceStatement(db, occurrence, input.now))
  }

  await db.batch(statements)
}

export async function applyEntireSeriesEdit(
  db: SeriesDatabase,
  input: {
    current: SlotSeriesRecord
    rule: SeriesRuleState
    affectedSlotIds: string[]
    occurrences: MaterializedOccurrenceInput[]
    now: number
  }
): Promise<void> {
  const statements: D1StatementLike[] = [
    db.prepare(`
      UPDATE slot_series
      SET slot_type_id = ?,
          local_start_time = ?,
          local_end_time = ?,
          starts_on = ?,
          ends_on = ?,
          materialize_after_at = ?,
          updated_at = ?
      WHERE id = ? AND space_id = ?
    `).bind(
      input.rule.slotTypeId,
      input.rule.localStartTime,
      input.rule.localEndTime,
      input.rule.startsOn,
      input.rule.endsOn,
      input.rule.materializeAfterAt,
      input.now,
      input.current.id,
      input.current.spaceId
    ),
    db.prepare('DELETE FROM slot_series_weekdays WHERE series_id = ?')
      .bind(input.current.id)
  ]

  for (const weekday of input.rule.weekdays) {
    statements.push(
      db.prepare('INSERT INTO slot_series_weekdays (series_id, weekday) VALUES (?, ?)')
        .bind(input.current.id, weekday)
    )
  }
  for (const slotId of input.affectedSlotIds) {
    statements.push(retireSlotStatement(db, slotId, input.current.id, input.now))
  }
  for (const occurrence of input.occurrences) {
    statements.push(insertOccurrenceStatement(db, occurrence, input.now))
  }

  await db.batch(statements)
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
