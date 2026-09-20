import type { CreateSlotSeriesInput, Slot } from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import {
  findResourceById,
  findSlotTypeById,
  type CatalogDatabase
} from '../catalog/repository'
import {
  findSeriesById,
  findSpaceTimezone,
  insertSeries,
  insertSeriesOccurrence,
  listActiveSeriesForRange,
  listConcreteSlotsByLocalDateRange,
  occurrenceExists,
  type SeriesDatabase,
  type SlotSeriesRecord
} from './repository'
import {
  addDays,
  isoWeekday,
  localDateTimeToEpochMs,
  parseDateOnly,
  parseLocalTime
} from './time'

type ResourceSeriesDatabase = SeriesDatabase & CatalogDatabase

function compareLocalTimes(start: string, end: string): void {
  const a = parseLocalTime(start, 'localStartTime')
  const b = parseLocalTime(end, 'localEndTime')
  if (b.hour * 60 + b.minute <= a.hour * 60 + a.minute) {
    throw new ValidationError('localEndTime must be later than localStartTime', {
      path: 'localEndTime'
    })
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof Error && error.message.includes('SLOT_OVERLAP')) {
    throw new AppError('SLOT_OVERLAP', '周期规则生成的时段与已有时段发生冲突。')
  }
  throw error
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
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的预约对象不能创建周期时段。')
  }
  if (slotType.status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的时段类型不能用于周期时段。')
  }
  return { timezone }
}

export async function createAdminSlotSeries(
  db: ResourceSeriesDatabase,
  spaceId: string,
  adminId: string,
  input: CreateSlotSeriesInput
): Promise<SlotSeriesRecord> {
  parseDateOnly(input.startsOn, 'startsOn')
  if (input.endsOn) {
    parseDateOnly(input.endsOn, 'endsOn')
    if (input.endsOn < input.startsOn) {
      throw new ValidationError('endsOn must not be earlier than startsOn', { path: 'endsOn' })
    }
  }
  compareLocalTimes(input.localStartTime, input.localEndTime)
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
  return record
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
      if (series.weekdays.includes(isoWeekday(date) as never)) {
        const exists = await occurrenceExists(db, series.id, date)
        if (!exists) {
          const startAt = localDateTimeToEpochMs(date, series.localStartTime, series.timezone)
          const endAt = localDateTimeToEpochMs(date, series.localEndTime, series.timezone)
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
