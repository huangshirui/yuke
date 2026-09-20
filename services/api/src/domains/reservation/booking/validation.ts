import type { CreateBookingInput } from '@yuke/shared'
import { expectObject, requireString } from '../../../lib/validation'

const ID_MAX_LENGTH = 128

export function parseCreateBookingInput(value: unknown): CreateBookingInput {
  const body = expectObject(value)

  return {
    slotId: requireString(body, 'slotId', { maxLength: ID_MAX_LENGTH }),
    participantId: requireString(body, 'participantId', { maxLength: ID_MAX_LENGTH })
  }
}
