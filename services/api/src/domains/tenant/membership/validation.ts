import type { JoinSpaceInput, UpdateCurrentSpaceInput } from '@yuke/shared'
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
