import type { CreateSlotInput } from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import { expectObject, optionalString, requireString } from '../../../lib/validation'

export type UpdateSingleSlotInput = {
  scope?: 'single'
  slotTypeId?: string
  startAt?: string
  endAt?: string
}

function requireIsoInstant(value: string, path: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${path} must be a valid ISO 8601 timestamp`, { path })
  }
  return value
}

export function parseCreateSlotInput(value: unknown): CreateSlotInput {
  const object = expectObject(value)
  return {
    resourceId: requireString(object, 'resourceId', { maxLength: 128 }),
    slotTypeId: requireString(object, 'slotTypeId', { maxLength: 128 }),
    startAt: requireIsoInstant(requireString(object, 'startAt'), 'startAt'),
    endAt: requireIsoInstant(requireString(object, 'endAt'), 'endAt')
  }
}

export function parseUpdateSingleSlotInput(value: unknown): UpdateSingleSlotInput {
  const object = expectObject(value)
  const scope = optionalString(object, 'scope')
  if (scope !== undefined && scope !== 'single') {
    throw new ValidationError('scope must be single for this operation', {
      path: 'scope',
      allowed: ['single']
    })
  }

  const slotTypeId = optionalString(object, 'slotTypeId', { maxLength: 128 })
  const startAtRaw = optionalString(object, 'startAt')
  const endAtRaw = optionalString(object, 'endAt')

  if (slotTypeId === undefined && startAtRaw === undefined && endAtRaw === undefined) {
    throw new ValidationError('At least one Slot field must be provided')
  }

  return {
    ...(scope === undefined ? {} : { scope: 'single' as const }),
    ...(slotTypeId === undefined ? {} : { slotTypeId }),
    ...(startAtRaw === undefined ? {} : { startAt: requireIsoInstant(startAtRaw, 'startAt') }),
    ...(endAtRaw === undefined ? {} : { endAt: requireIsoInstant(endAtRaw, 'endAt') })
  }
}
