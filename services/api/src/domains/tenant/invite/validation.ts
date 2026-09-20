import type { CreateInviteInput } from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  optionalString,
  requireString
} from '../../../lib/validation'

export function parseCreateInviteInput(
  value: unknown,
  now = Date.now()
): CreateInviteInput {
  const body = expectObject(value)
  const rawLabel = body.label
  let label: string | null = null

  if (rawLabel !== undefined && rawLabel !== null) {
    label = optionalString(body, 'label', { maxLength: 128 }) ?? null
    if (label.length === 0) {
      label = null
    }
  }

  const expiresAt = requireString(body, 'expiresAt', { maxLength: 64 })
  const expiresAtMs = Date.parse(expiresAt)

  if (!Number.isFinite(expiresAtMs)) {
    throw new ValidationError('expiresAt must be a valid ISO 8601 timestamp', {
      path: 'expiresAt'
    })
  }
  if (expiresAtMs <= now) {
    throw new ValidationError('expiresAt must be in the future', {
      path: 'expiresAt'
    })
  }

  return {
    label,
    expiresAt: new Date(expiresAtMs).toISOString()
  }
}
