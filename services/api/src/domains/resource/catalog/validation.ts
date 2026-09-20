import type {
  CreateResourceInput,
  CreateSlotTypeInput,
  UpdateResourceInput,
  UpdateSlotTypeInput
} from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  optionalString,
  requireString,
  type JsonObject
} from '../../../lib/validation'

function optionalNullableString(
  object: JsonObject,
  key: string,
  maxLength: number
): string | null | undefined {
  const rawValue = object[key]
  if (rawValue === undefined) {
    return undefined
  }
  if (rawValue === null) {
    return null
  }
  if (typeof rawValue !== 'string') {
    throw new ValidationError(`${key} must be a string or null`, { path: key })
  }

  const value = rawValue.trim()
  if (value.length > maxLength) {
    throw new ValidationError(`${key} is too long`, {
      path: key,
      maxLength
    })
  }

  return value.length === 0 ? null : value
}

export function parseCreateResourceInput(value: unknown): CreateResourceInput {
  const body = expectObject(value)
  return {
    name: requireString(body, 'name', { maxLength: 128 }),
    note: optionalNullableString(body, 'note', 2000)
  }
}

export function parseUpdateResourceInput(value: unknown): UpdateResourceInput {
  const body = expectObject(value)
  const name = optionalString(body, 'name', { maxLength: 128 })
  const note = optionalNullableString(body, 'note', 2000)

  if (name === undefined && note === undefined) {
    throw new ValidationError('At least one Resource field is required')
  }
  if (name !== undefined && name.length === 0) {
    throw new ValidationError('name is too short', {
      path: 'name',
      minLength: 1
    })
  }

  return {
    ...(name === undefined ? {} : { name }),
    ...(note === undefined ? {} : { note })
  }
}

export function parseCreateSlotTypeInput(value: unknown): CreateSlotTypeInput {
  const body = expectObject(value)
  return {
    name: requireString(body, 'name', { maxLength: 128 })
  }
}

export function parseUpdateSlotTypeInput(value: unknown): UpdateSlotTypeInput {
  const body = expectObject(value)
  const name = optionalString(body, 'name', { maxLength: 128 })

  if (name === undefined) {
    throw new ValidationError('At least one Slot Type field is required')
  }
  if (name.length === 0) {
    throw new ValidationError('name is too short', {
      path: 'name',
      minLength: 1
    })
  }

  return { name }
}
