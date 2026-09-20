import type {
  CreateSlotSeriesInput,
  IsoWeekday,
  SeriesEditResult,
  Slot,
  SlotSeriesSummary
} from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import {
  findResourceById,
  findSlotTypeById,
  type CatalogDatabase
} from '../catalog/repository'
import {
  findSlotById,
  type SlotDatabase,
  type SlotRecord
} from '../slot/repository'
import {
  applyEntireSeriesEdit,
  applySplitSeriesEdit,
  findSeriesById,
  findSpaceTimezone,
  insertSeries,
  insertSeriesOccurrence,
  listActiveSeriesForRange,
  listConcreteSlotsByLocalDateRange,
  listSeriesSlotsFromOccurrenceDate,
  listSeriesSlotsStartingAtOrAfter,
  occurrenceExists,
  type MaterializedOccurrenceInput,
  type SeriesDatabase,
  type SeriesRuleState,
  type SeriesSlotForEdit,
  type SlotSeriesRecord
} from './repository'
import {
  addDays,
  isoWeekday,
  localDateForEpochMs,
  localDateTimeToEpochMs,
  parseDateOnly,
  parseLocalTime
} from './time'
import type { BulkSeriesEditInput } from './validation'

type ResourceSeriesDatabase = SeriesDatabase & CatalogDatabase & SlotDatabase

function toSlotSeriesSummary(series: SlotSeriesRecord): SlotSeriesSummary {
  return {
    id: series.id,
    spaceId: series.spaceId,
    resourceId: series.resourceId,
    slotTypeId: series.slotTypeId,
    weekdays: series.weekdays,
    localStartTime: series.localStartTime,
    localEndTime: series.localEndTime,
    startsOn: series.startsOn,
    endsOn: series.endsOn,
    status: series.status,
    supersedesSeriesId: series.supersedesSeriesId
  }
}

function compareLocalTimes(start: string, end: string): void {
  const a = parseLocalTime(start, 'localStartTime')
  const b = parseLocalTime(end, 'localEndTime')
  if (b.hour * 60 + b.minute <= a.hour * 60 + a.minute) {
    throw new ValidationError('localEndTime must be later than localStartTime', {
      path: 'localEndTime'
    })
  }
}

function validateRule(rule: SeriesRuleState): void {
  parseDateOnly(rule.startsOn, 'startsOn')
  if (rule.endsOn !== null) {
    parseDateOnly(rule.endsOn, 'endsOn')
    if (rule.endsOn < rule.startsOn) {
      throw new ValidationError('endsOn must not be earlier than startsOn', {
        path: 'endsOn'
      })
    }
  }
  if (rule.weekdays.length === 0) {
    throw new ValidationError('weekdays must contain at least one ISO weekday', {
      path: 'weekdays'
    })
  }
  compareLocalTimes(rule.localStartTime, rule.localEndTime)
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof Error && error.message.includes('SLOT_OVERLAP')) {
    throw new AppError('SLOT_OVERLAP', '周期规则生成的时段与已有时段发生冲突。')
  }
  throw error
}

function mapSeriesEditDatabaseError(error: unknown): never {
  if (error instanceof Error && error.message.includes('SLOT_HAS_ACTIVE_BOOKING')) {
    throw new AppError(
      'SERIES_BOOKING_CONFLICT',
      '周期调整期间该时段刚刚产生了有效预约，请刷新后逐条处理。'
    )
  }
  mapDatabaseError(error)
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function mergeRule(
  current: SlotSeriesRecord,
  patch: BulkSeriesEditInput,
  options: {
    startsOn: string
    materializeAfterAt: number | null
  }
): SeriesRuleState {
  const rule: SeriesRuleState = {
    slotTypeId: patch.slotTypeId ?? current.slotTypeId,
    weekdays: patch.weekdays ?? current.weekdays,
    localStartTime: patch.localStartTime ?? current.localStartTime,
    localEndTime: patch.localEndTime ?? current.localEndTime,
    startsOn: options.startsOn,
    endsOn: hasOwn(patch, 'endsOn') ? (patch.endsOn ?? null) : current.endsOn,
    materializeAfterAt: options.materializeAfterAt
  }
  validateRule(rule)
  return rule
}

async function requireActiveCatalog(
  db: ResourceSeriesDatabase,
  spaceId: string,
  resourceId: string,
  slotTypeId: string
): Promise<{ timezone: string }> {
  const [timezone, resource, slotType] = await Promise.all([
    findSpaceTimezone(db, spaceId),
    findResourceById(db, spaceId, resourceId),
    findSlotTypeById(db, spaceId, slotTypeId)
  ])
  if (!timezone) throw new AppError('NOT_FOUND', 'Space not found')
  if (!resource) throw new AppError('NOT_FOUND', 'Resource not found')
  if (!slotType) throw new AppError('NOT_FOUND', 'SlotType not found')
  if (resource.status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的预约对象不能创建或调整周期时段。')
  }
  if (slotType.status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的时段类型不能用于周期时段。')
  }
  return { timezone }
}

function throwBookingConflicts(slots: SeriesSlotForEdit[]): void {
  const conflicts = slots
    .filter((slot) => slot.bookingId !== null)
    .map((slot) => ({
      slotId: slot.id,
      bookingId: slot.bookingId,
      localDate: slot.localDate
    }))

  if (conflicts.length > 0) {
    throw new AppError(
      'SERIES_BOOKING_CONFLICT',
      '周期调整会影响已有预约，请先单独处理这些预约。',
      { conflicts }
    )
  }
}

function maxLocalDate(slots: SeriesSlotForEdit[], fallback: string): string {
  return slots.reduce(
    (latest, slot) => slot.localDate > latest ? slot.localDate : latest,
    fallback
  )
}

function buildOccurrences(
  series: {
    id: string
    spaceId: string
    resourceId: string
    timezone: string
    createdByAdminId: string
  },
  rule: SeriesRuleState,
  from: string,
  to: string
): MaterializedOccurrenceInput[] {
  let date = from > rule.startsOn ? from : rule.startsOn
  const upper = rule.endsOn !== null && rule.endsOn < to ? rule.endsOn : to
  const occurrences: MaterializedOccurrenceInput[] = []

  while (date <= upper) {
    if (rule.weekdays.includes(isoWeekday(date) as IsoWeekday)) {
      const startAt = localDateTimeToEpochMs(date, rule.localStartTime, series.timezone)
      const endAt = localDateTimeToEpochMs(date, rule.localEndTime, series.timezone)
      if (rule.materializeAfterAt === null || startAt >= rule.materializeAfterAt) {
        occurrences.push({
          id: `slot_${crypto.randomUUID().replace(/-/g, '')}`,
          seriesId: series.id,
          spaceId: series.spaceId,
          resourceId: series.resourceId,
          slotTypeId: rule.slotTypeId,
          date,
          startAt,
          endAt,
          createdByAdminId: series.createdByAdminId
        })
      }
    }
    date = addDays(date, 1)
  }

  return occurrences
}

async function requireSeriesAnchor(
  db: ResourceSeriesDatabase,
  spaceId: string,
  slotId: string
): Promise<{ anchor: SlotRecord; series: SlotSeriesRecord }> {
  const anchor = await findSlotById(db, spaceId, slotId)
  if (!anchor) throw new AppError('NOT_FOUND', 'Slot not found')
  if (!anchor.seriesId || !anchor.seriesOccurrenceDate) {
    throw new ValidationError('Bulk Series edit requires a concrete recurring Slot', {
      path: 'scope'
    })
  }

  const series = await findSeriesById(db, spaceId, anchor.seriesId)
  if (!series) throw new AppError('NOT_FOUND', 'SlotSeries not found')
  if (series.status !== 'active') {
    throw new ValidationError('Only an active SlotSeries can be bulk edited', {
      seriesId: series.id
    })
  }

  return { anchor, series }
}

export async function createAdminSlotSeries(
  db: ResourceSeriesDatabase,
  spaceId: string,
  adminId: string,
  input: CreateSlotSeriesInput
): Promise<SlotSeriesSummary> {
  const rule: SeriesRuleState = {
    slotTypeId: input.slotTypeId,
    weekdays: input.weekdays,
    localStartTime: input.localStartTime,
    localEndTime: input.localEndTime,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    materializeAfterAt: null
  }
  validateRule(rule)

  const { timezone } = await requireActiveCatalog(
    db,
    spaceId,
    input.resourceId,
    input.slotTypeId
  )
  const id = `series_${crypto.randomUUID().replace(/-/g, '')}`
  await insertSeries(db, {
    id,
    spaceId,
    timezone,
    adminId,
    rule: input,
    now: Date.now()
  })
  const record = await findSeriesById(db, spaceId, id)
  if (!record) throw new AppError('INTERNAL_ERROR', 'Created SlotSeries could not be reloaded')
  return toSlotSeriesSummary(record)
}

export async function editAdminSlotSeriesFromOccurrence(
  db: ResourceSeriesDatabase,
  spaceId: string,
  slotId: string,
  adminId: string,
  patch: BulkSeriesEditInput,
  now = Date.now()
): Promise<SeriesEditResult> {
  const { anchor, series: current } = await requireSeriesAnchor(db, spaceId, slotId)

  if (patch.scope === 'this_and_future') {
    if (Date.parse(anchor.startAt) < now) {
      throw new ValidationError(
        'this_and_future must start from a Slot that has not started yet',
        { path: 'scope', slotId: anchor.id }
      )
    }

    const effectiveDate = anchor.seriesOccurrenceDate
    if (patch.startsOn !== undefined && patch.startsOn !== effectiveDate) {
      throw new ValidationError(
        'this_and_future startsOn is fixed to the selected occurrence date',
        { path: 'startsOn', expected: effectiveDate }
      )
    }

    const rule = mergeRule(current, patch, {
      startsOn: effectiveDate,
      materializeAfterAt: null
    })
    await requireActiveCatalog(db, spaceId, current.resourceId, rule.slotTypeId)

    const affected = await listSeriesSlotsFromOccurrenceDate(
      db,
      current.id,
      effectiveDate
    )
    throwBookingConflicts(affected)

    const replacementId = `series_${crypto.randomUUID().replace(/-/g, '')}`
    const replacement: SlotSeriesRecord = {
      ...current,
      id: replacementId,
      slotTypeId: rule.slotTypeId,
      localStartTime: rule.localStartTime,
      localEndTime: rule.localEndTime,
      startsOn: rule.startsOn,
      endsOn: rule.endsOn,
      materializeAfterAt: null,
      status: 'active',
      supersedesSeriesId: current.id,
      createdByAdminId: adminId,
      weekdays: rule.weekdays
    }
    const horizon = maxLocalDate(affected, effectiveDate)
    const occurrences = buildOccurrences(replacement, rule, effectiveDate, horizon)
    const candidateOldEnd = addDays(effectiveDate, -1)
    const oldStatus = candidateOldEnd < current.startsOn ? 'ended' : current.status
    const oldEndsOn = candidateOldEnd < current.startsOn
      ? current.startsOn
      : candidateOldEnd

    try {
      await applySplitSeriesEdit(db, {
        current,
        oldEndsOn,
        oldStatus,
        replacement,
        affectedSlotIds: affected.map((slot) => slot.id),
        occurrences,
        now
      })
    } catch (error) {
      mapSeriesEditDatabaseError(error)
    }

    const saved = await findSeriesById(db, spaceId, replacementId)
    if (!saved) {
      throw new AppError('INTERNAL_ERROR', 'Superseding SlotSeries could not be reloaded')
    }
    return {
      scope: patch.scope,
      series: toSlotSeriesSummary(saved),
      retiredSlotIds: affected.map((slot) => slot.id),
      materializedCount: occurrences.length
    }
  }

  const effectiveDate = localDateForEpochMs(now, current.timezone)
  const requestedStartsOn = patch.startsOn ?? current.startsOn
  const rule = mergeRule(current, patch, {
    startsOn: requestedStartsOn,
    materializeAfterAt: now
  })
  await requireActiveCatalog(db, spaceId, current.resourceId, rule.slotTypeId)

  const affected = await listSeriesSlotsStartingAtOrAfter(db, current.id, now)
  throwBookingConflicts(affected)

  const horizon = maxLocalDate(affected, effectiveDate)
  const occurrences = buildOccurrences(
    {
      ...current,
      slotTypeId: rule.slotTypeId,
      createdByAdminId: adminId
    },
    rule,
    effectiveDate,
    horizon
  )

  try {
    await applyEntireSeriesEdit(db, {
      current,
      rule,
      affectedSlotIds: affected.map((slot) => slot.id),
      occurrences,
      now
    })
  } catch (error) {
    mapSeriesEditDatabaseError(error)
  }

  const saved = await findSeriesById(db, spaceId, current.id)
  if (!saved) throw new AppError('INTERNAL_ERROR', 'Updated SlotSeries could not be reloaded')
  return {
    scope: patch.scope,
    series: toSlotSeriesSummary(saved),
    retiredSlotIds: affected.map((slot) => slot.id),
    materializedCount: occurrences.length
  }
}

export async function ensureSeriesMaterialized(
  db: SeriesDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<number> {
  parseDateOnly(from, 'from')
  parseDateOnly(to, 'to')
  if (to < from) throw new ValidationError('to must not be earlier than from', { path: 'to' })

  const seriesList = await listActiveSeriesForRange(db, spaceId, resourceId, from, to)
  let inserted = 0

  for (const series of seriesList) {
    let date = from < series.startsOn ? series.startsOn : from
    const upper = series.endsOn && series.endsOn < to ? series.endsOn : to

    while (date <= upper) {
      if (series.weekdays.includes(isoWeekday(date) as IsoWeekday)) {
        const exists = await occurrenceExists(db, series.id, date)
        if (!exists) {
          const startAt = localDateTimeToEpochMs(date, series.localStartTime, series.timezone)
          const endAt = localDateTimeToEpochMs(date, series.localEndTime, series.timezone)

          if (series.materializeAfterAt !== null && startAt < series.materializeAfterAt) {
            date = addDays(date, 1)
            continue
          }

          try {
            await insertSeriesOccurrence(db, {
              id: `slot_${crypto.randomUUID().replace(/-/g, '')}`,
              series,
              date,
              startAt,
              endAt,
              now: Date.now()
            })
            inserted += 1
          } catch (error) {
            if (error instanceof Error && error.message.includes('SLOT_OVERLAP')) {
              if (await occurrenceExists(db, series.id, date)) {
                date = addDays(date, 1)
                continue
              }
            }
            mapDatabaseError(error)
          }
        }
      }
      date = addDays(date, 1)
    }
  }
  return inserted
}

export async function listMaterializedSlots(
  db: SeriesDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<Slot[]> {
  await ensureSeriesMaterialized(db, spaceId, resourceId, from, to)
  return listConcreteSlotsByLocalDateRange(db, spaceId, resourceId, from, to)
}
