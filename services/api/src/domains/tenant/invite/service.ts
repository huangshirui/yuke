import type {
  CreateInviteInput,
  InviteMemberSummary,
  InviteSummary
} from '@yuke/shared'
import { AppError } from '../../../lib/errors'
import type { AdminPrincipal } from '../../../lib/auth'
import {
  findInviteById,
  insertInvite,
  listInviteMembers,
  listInvites,
  revokeInvite,
  spaceExists,
  type TenantDatabase
} from './repository'

function notFound(entity: 'Space' | 'InviteCode'): AppError {
  return new AppError('NOT_FOUND', `${entity} not found`)
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)

  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function requireSpaceExists(
  db: TenantDatabase,
  spaceId: string
): Promise<void> {
  if (!(await spaceExists(db, spaceId))) {
    throw notFound('Space')
  }
}

export async function listAdminInvites(
  db: TenantDatabase,
  spaceId: string
): Promise<InviteSummary[]> {
  await requireSpaceExists(db, spaceId)
  return listInvites(db, spaceId)
}

export async function createAdminInvite(
  db: TenantDatabase,
  spaceId: string,
  principal: AdminPrincipal,
  input: CreateInviteInput
): Promise<InviteSummary> {
  await requireSpaceExists(db, spaceId)

  const id = `inv_${crypto.randomUUID().replace(/-/g, '')}`
  const now = Date.now()
  const expiresAt = Date.parse(input.expiresAt)
  const code = generateInviteCode()

  await insertInvite(db, {
    id,
    spaceId,
    createdByAdminId: principal.id,
    code,
    label: input.label,
    expiresAt,
    now
  })

  const created = await findInviteById(db, spaceId, id)
  if (!created) {
    throw new AppError('INTERNAL_ERROR', 'InviteCode creation failed')
  }
  return created
}

export async function revokeAdminInvite(
  db: TenantDatabase,
  spaceId: string,
  inviteId: string
): Promise<InviteSummary> {
  await requireSpaceExists(db, spaceId)
  const existing = await findInviteById(db, spaceId, inviteId)
  if (!existing) {
    throw notFound('InviteCode')
  }

  if (existing.status !== 'revoked') {
    await revokeInvite(db, spaceId, inviteId, Date.now())
  }

  const updated = await findInviteById(db, spaceId, inviteId)
  if (!updated) {
    throw new AppError('INTERNAL_ERROR', 'InviteCode update failed')
  }
  return updated
}

export async function readAdminInviteMembers(
  db: TenantDatabase,
  spaceId: string,
  inviteId: string
): Promise<InviteMemberSummary[]> {
  await requireSpaceExists(db, spaceId)
  const invite = await findInviteById(db, spaceId, inviteId)
  if (!invite) {
    throw notFound('InviteCode')
  }

  return listInviteMembers(db, spaceId, inviteId)
}
