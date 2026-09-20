import type {
  CreateSpaceInput,
  CutoffMinutes,
  UpdateSpaceInput,
  UpdateSpaceSettingsInput
} from '@yuke/shared'
import { CUTOFF_MINUTES } from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  optionalString,
  requireString,
  type JsonObject
} from '../../../lib/validation'

function validateTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0)
  } catch {
    throw new ValidationError('timezone must be a valid IANA time zone', {
      path: 'timezone'
    })
  }
  return timezone
}

function parseCutoffValue(
  object: JsonObject,
  key: 'bookingCutoffMinutes' | 'cancellationCutoffMinutes',
  required: boolean
): CutoffMinutes | undefined {
  if (!(key in object)) {
    if (required) {
      throw new ValidationError(`${key} is required`, { path: key })
    }
    return undefined
  }

  const value = object[key]
  if (value === null) {
    return null
  }

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    !CUTOFF_MINUTES.includes(value as (typeof CUTOFF_MINUTES)[number])
  ) {
    throw new ValidationError(`${key} has an unsupported value`, {
      path: key,
      allowed: [...CUTOFF_MINUTES, null]
    })
  }

  return value as Exclude<CutoffMinutes, null>
}

export function parseCreateSpaceInput(value: unknown): CreateSpaceInput {
  const body = expectObject(value)
  const timezone = validateTimezone(
    requireString(body, 'timezone', { maxLength: 128 })
  )

  return {
    name: requireString(body, 'name', { maxLength: 128 }),
    timezone,
    bookingCutoffMinutes: parseCutoffValue(
      body,
      'bookingCutoffMinutes',
      true
    ) as CutoffMinutes,
    cancellationCutoffMinutes: parseCutoffValue(
      body,
      'cancellationCutoffMinutes',
      true
    ) as CutoffMinutes
  }
}

export function parseUpdateSpaceInput(value: unknown): UpdateSpaceInput {
  const body = expectObject(value)
  const name = optionalString(body, 'name', { maxLength: 128 })
  const rawTimezone = optionalString(body, 'timezone', { maxLength: 128 })
  const timezone =
    rawTimezone === undefined ? undefined : validateTimezone(rawTimezone)

  if (name === undefined && timezone === undefined) {
    throw new ValidationError('At least one Space field is required')
  }
  if (name !== undefined && name.length === 0) {
    throw new ValidationError('name is too short', { path: 'name', minLength: 1 })
  }
  if (timezone !== undefined && timezone.length === 0) {
    throw new ValidationError('timezone is too short', {
      path: 'timezone',
      minLength: 1
    })
  }

  return {
    ...(name === undefined ? {} : { name }),
    ...(timezone === undefined ? {} : { timezone })
  }
}

export function parseUpdateSpaceSettingsInput(
  value: unknown
): UpdateSpaceSettingsInput {
  const body = expectObject(value)
  const bookingCutoffMinutes = parseCutoffValue(
    body,
    'bookingCutoffMinutes',
    false
  )
  const cancellationCutoffMinutes = parseCutoffValue(
    body,
    'cancellationCutoffMinutes',
    false
  )

  if (
    bookingCutoffMinutes === undefined &&
    cancellationCutoffMinutes === undefined
  ) {
    throw new ValidationError('At least one Space setting is required')
  }

  return {
    ...(bookingCutoffMinutes === undefined ? {} : { bookingCutoffMinutes }),
    ...(cancellationCutoffMinutes === undefined
      ? {}
      : { cancellationCutoffMinutes })
  }
}

export function parseAdminUserId(value: unknown): string {
  const body = expectObject(value)
  return requireString(body, 'adminUserId', { maxLength: 128 })
}
