import type {
  JoinSpaceInput,
  UpdateAdminNoteInput,
  UpdateCurrentSpaceInput
} from '@yuke/shared'
import { ValidationError } from '../../../lib/errors'
import {
  expectObject,
  requireString
} from '../../../lib/validation'

export function parseJoinSpaceInput(value: unknown): JoinSpaceInput {
  const body = expectObject(value)
  return {
    inviteCode: requireString(body, 'inviteCode', { maxLength: 256 })
  }
}

export function parseCurrentSpaceInput(value: unknown): UpdateCurrentSpaceInput {
  const body = expectObject(value)
  return {
    spaceId: requireString(body, 'spaceId', { maxLength: 128 })
  }
}


export function parseAdminMemberFilters(request: Request): {
  invitedByAdminId?: string
  inviteCodeId?: string
} {
  const url = new URL(request.url)
  const filters: { invitedByAdminId?: string; inviteCodeId?: string } = {}

  for (const key of ['invitedByAdminId', 'inviteCodeId'] as const) {
    const value = url.searchParams.get(key)
    if (value === null || value === '') continue
    if (value.length > 128) {
      throw new ValidationError(`${key} is too long`, { path: key, maxLength: 128 })
    }
    filters[key] = value
  }

  return filters
}

export function parseUpdateAdminNoteInput(value: unknown): UpdateAdminNoteInput {
  const body = expectObject(value)
  if (!Object.prototype.hasOwnProperty.call(body, 'adminNote')) {
    throw new ValidationError('adminNote is required', { path: 'adminNote' })
  }

  const raw = body.adminNote
  if (raw === null) return { adminNote: null }
  if (typeof raw !== 'string') {
    throw new ValidationError('adminNote must be a string or null', { path: 'adminNote' })
  }

  const adminNote = raw.trim()
  if (adminNote.length > 2000) {
    throw new ValidationError('adminNote is too long', { path: 'adminNote', maxLength: 2000 })
  }

  return { adminNote: adminNote || null }
}
