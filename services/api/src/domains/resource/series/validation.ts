import type { CreateSlotSeriesInput, IsoWeekday } from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import { expectObject, requireString } from '../../../lib/validation'
import { parseDateOnly, parseLocalTime } from './time'

export function parseCreateSlotSeriesInput(value: unknown): CreateSlotSeriesInput {
  const object = expectObject(value)
  const resourceId = requireString(object, 'resourceId', { maxLength: 128 })
  const slotTypeId = requireString(object, 'slotTypeId', { maxLength: 128 })
  const localStartTime = requireString(object, 'localStartTime')
  const localEndTime = requireString(object, 'localEndTime')
  const startsOn = requireString(object, 'startsOn')
  const rawEndsOn = object.endsOn
  const rawWeekdays = object.weekdays

  parseLocalTime(localStartTime, 'localStartTime')
  parseLocalTime(localEndTime, 'localEndTime')
  parseDateOnly(startsOn, 'startsOn')

  const endsOn = rawEndsOn === null
    ? null
    : typeof rawEndsOn === 'string'
      ? rawEndsOn
      : (() => { throw new ValidationError('endsOn must be YYYY-MM-DD or null', { path: 'endsOn' }) })()
  if (endsOn !== null) parseDateOnly(endsOn, 'endsOn')

  if (!Array.isArray(rawWeekdays) || rawWeekdays.length === 0) {
    throw new ValidationError('weekdays must contain at least one ISO weekday', { path: 'weekdays' })
  }
  const weekdays = [...new Set(rawWeekdays.map((value) => Number(value)))]
  if (weekdays.some((value) => !Number.isInteger(value) || value < 1 || value > 7)) {
    throw new ValidationError('weekdays must contain values from 1 to 7', { path: 'weekdays' })
  }

  return {
    resourceId,
    slotTypeId,
    weekdays: weekdays as IsoWeekday[],
    localStartTime,
    localEndTime,
    startsOn,
    endsOn
  }
}
