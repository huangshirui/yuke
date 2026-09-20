import type {
  CreateParticipantInput,
  UpdateParticipantInput
} from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  requireString,
  type JsonObject
} from '../../../lib/validation'

const BIRTH_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const NAME_MAX_LENGTH = 64
const NOTE_MAX_LENGTH = 1000

function parseBirthMonth(value: string): string {
  if (!BIRTH_MONTH.test(value)) {
    throw new ValidationError('birthMonth must use YYYY-MM with a valid month', {
      path: 'birthMonth',
      format: 'YYYY-MM'
    })
  }
  return value
}

function parseNullableNote(object: JsonObject): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(object, 'note')) {
    return undefined
  }

  const rawValue = object.note
  if (rawValue === null) {
    return null
  }
  if (typeof rawValue !== 'string') {
    throw new ValidationError('note must be a string or null', { path: 'note' })
  }

  const value = rawValue.trim()
  if (value.length > NOTE_MAX_LENGTH) {
    throw new ValidationError('note is too long', {
      path: 'note',
      maxLength: NOTE_MAX_LENGTH
    })
  }

  return value.length === 0 ? null : value
}

export function parseCreateParticipantInput(value: unknown): CreateParticipantInput {
  const body = expectObject(value)
  const birthMonth = requireString(body, 'birthMonth', {
    trim: false,
    maxLength: 7
  })

  return {
    name: requireString(body, 'name', { maxLength: NAME_MAX_LENGTH }),
    birthMonth: parseBirthMonth(birthMonth),
    note: parseNullableNote(body) ?? null
  }
}

export function parseUpdateParticipantInput(value: unknown): UpdateParticipantInput {
  const body = expectObject(value)
  const result: UpdateParticipantInput = {}

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    result.name = requireString(body, 'name', { maxLength: NAME_MAX_LENGTH })
  }

  if (Object.prototype.hasOwnProperty.call(body, 'birthMonth')) {
    result.birthMonth = parseBirthMonth(
      requireString(body, 'birthMonth', { trim: false, maxLength: 7 })
    )
  }

  const note = parseNullableNote(body)
  if (note !== undefined) {
    result.note = note
  }

  if (
    result.name === undefined &&
    result.birthMonth === undefined &&
    result.note === undefined
  ) {
    throw new ValidationError('At least one participant field must be provided')
  }

  return result
}
