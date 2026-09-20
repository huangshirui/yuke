import type {
  BookingStatus,
  UpdateAdminBookingInput
} from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  requireString
} from '../../../lib/validation'
import type { BookingListFilters } from './repository'

const ID_MAX_LENGTH = 128
const BOOKING_STATUSES: readonly BookingStatus[] = ['booked', 'cancelled', 'completed']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value: string, key: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new ValidationError(`${key} must use YYYY-MM-DD`, { path: key })
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${key} must be a valid date`, { path: key })
  }
  return value
}

function queryId(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)
  if (value === null) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > ID_MAX_LENGTH) {
    throw new ValidationError(`${key} must be a non-empty identifier`, {
      path: key,
      maxLength: ID_MAX_LENGTH
    })
  }
  return trimmed
}

export function parseCreateBookingInput(value: unknown): {
  slotId: string
  participantId: string
} {
  const body = expectObject(value)

  return {
    slotId: requireString(body, 'slotId', { maxLength: ID_MAX_LENGTH }),
    participantId: requireString(body, 'participantId', { maxLength: ID_MAX_LENGTH })
  }
}

export function parseUpdateAdminBookingInput(
  value: unknown
): UpdateAdminBookingInput {
  const body = expectObject(value)
  const result: UpdateAdminBookingInput = {}

  if (Object.prototype.hasOwnProperty.call(body, 'slotId')) {
    result.slotId = requireString(body, 'slotId', { maxLength: ID_MAX_LENGTH })
  }
  if (Object.prototype.hasOwnProperty.call(body, 'participantId')) {
    result.participantId = requireString(body, 'participantId', {
      maxLength: ID_MAX_LENGTH
    })
  }

  if (result.slotId === undefined && result.participantId === undefined) {
    throw new ValidationError('At least one Booking field must be provided')
  }

  return result
}

export function parseBookingListFilters(
  request: Request,
  admin = false
): BookingListFilters {
  const url = new URL(request.url)
  const fromRaw = url.searchParams.get('from')
  const toRaw = url.searchParams.get('to')
  const statusRaw = url.searchParams.get('status')

  const from = fromRaw === null ? undefined : parseDate(fromRaw, 'from')
  const to = toRaw === null ? undefined : parseDate(toRaw, 'to')

  if (from && to && to < from) {
    throw new ValidationError('to must not be earlier than from', {
      path: 'to'
    })
  }

  let status: BookingStatus | undefined
  if (statusRaw !== null) {
    if (!BOOKING_STATUSES.includes(statusRaw as BookingStatus)) {
      throw new ValidationError('status has an unsupported value', {
        path: 'status',
        allowed: BOOKING_STATUSES
      })
    }
    status = statusRaw as BookingStatus
  }

  const filters: BookingListFilters = { from, to, status }

  if (admin) {
    filters.resourceId = queryId(url, 'resourceId')
    filters.participantId = queryId(url, 'participantId')
    filters.slotTypeId = queryId(url, 'slotTypeId')
  }

  return filters
}
