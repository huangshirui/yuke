import type {
  CreateSlotSeriesInput,
  IsoWeekday,
  UpdateSeriesSlotInput
} from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  optionalString,
  requireOneOf,
  requireString
} from '../../../lib/validation'
import { parseDateOnly, parseLocalTime } from './time'

export type BulkSeriesEditInput = UpdateSeriesSlotInput & {
  scope: 'this_and_future' | 'entire_series'
}

function parseWeekdays(value: unknown, required: boolean): IsoWeekday[] | undefined {
  if (value === undefined && !required) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('weekdays must contain at least one ISO weekday', {
      path: 'weekdays'
    })
  }
  const weekdays = [...new Set(value.map((item) => Number(item)))]
  if (weekdays.some((item) => !Number.isInteger(item) || item < 1 || item > 7)) {
    throw new ValidationError('weekdays must contain values from 1 to 7', {
      path: 'weekdays'
    })
  }
  return weekdays as IsoWeekday[]
}

function parseOptionalDate(
  object: Record<string, unknown>,
  key: 'startsOn' | 'endsOn',
  allowNull: boolean
): string | null | undefined {
  const raw = object[key]
  if (raw === undefined) return undefined
  if (raw === null && allowNull) return null
  if (typeof raw !== 'string') {
    throw new ValidationError(`${key} must be YYYY-MM-DD${allowNull ? ' or null' : ''}`, {
      path: key
    })
  }
  parseDateOnly(raw, key)
  return raw
}

export function parseCreateSlotSeriesInput(value: unknown): CreateSlotSeriesInput {
  const object = expectObject(value)
  const resourceId = requireString(object, 'resourceId', { maxLength: 128 })
  const slotTypeId = requireString(object, 'slotTypeId', { maxLength: 128 })
  const localStartTime = requireString(object, 'localStartTime')
  const localEndTime = requireString(object, 'localEndTime')
  const startsOn = requireString(object, 'startsOn')
  const rawEndsOn = object.endsOn

  parseLocalTime(localStartTime, 'localStartTime')
  parseLocalTime(localEndTime, 'localEndTime')
  parseDateOnly(startsOn, 'startsOn')

  const endsOn = rawEndsOn === null
    ? null
    : typeof rawEndsOn === 'string'
      ? rawEndsOn
      : (() => {
          throw new ValidationError('endsOn must be YYYY-MM-DD or null', { path: 'endsOn' })
        })()
  if (endsOn !== null) parseDateOnly(endsOn, 'endsOn')

  return {
    resourceId,
    slotTypeId,
    weekdays: parseWeekdays(object.weekdays, true) as IsoWeekday[],
    localStartTime,
    localEndTime,
    startsOn,
    endsOn
  }
}

export function parseBulkSeriesEditInput(value: unknown): BulkSeriesEditInput {
  const object = expectObject(value)
  const scope = requireOneOf(
    object,
    'scope',
    ['this_and_future', 'entire_series'] as const
  )
  const slotTypeId = optionalString(object, 'slotTypeId', { maxLength: 128 })
  const localStartTime = optionalString(object, 'localStartTime')
  const localEndTime = optionalString(object, 'localEndTime')
  const startsOn = parseOptionalDate(object, 'startsOn', false)
  const endsOn = parseOptionalDate(object, 'endsOn', true)
  const weekdays = parseWeekdays(object.weekdays, false)

  if (localStartTime !== undefined) parseLocalTime(localStartTime, 'localStartTime')
  if (localEndTime !== undefined) parseLocalTime(localEndTime, 'localEndTime')

  if (
    slotTypeId === undefined &&
    localStartTime === undefined &&
    localEndTime === undefined &&
    startsOn === undefined &&
    endsOn === undefined &&
    weekdays === undefined
  ) {
    throw new ValidationError('At least one Series field must be provided')
  }

  return {
    scope,
    ...(slotTypeId === undefined ? {} : { slotTypeId }),
    ...(weekdays === undefined ? {} : { weekdays }),
    ...(localStartTime === undefined ? {} : { localStartTime }),
    ...(localEndTime === undefined ? {} : { localEndTime }),
    ...(startsOn === undefined ? {} : { startsOn }),
    ...(endsOn === undefined ? {} : { endsOn })
  }
}
