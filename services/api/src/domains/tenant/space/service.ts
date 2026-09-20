import type {
  CreateSpaceInput,
  SpaceAdminSummary,
  SpaceDetail,
  SpaceSettings,
  SpaceSummary,
  UpdateSpaceInput,
  UpdateSpaceSettingsInput
} from '@yuke/shared'
import { AppError } from '../../../lib/errors'
import type { AdminPrincipal } from '../../../lib/auth'
import {
  assignSpaceAdmin,
  createSpaceWithSettings,
  findAdminById,
  findSpaceById,
  getSpaceSettings,
  hasSpaceAdminAssignment,
  listSpaceAdmins,
  listSpacesForAdmin,
  removeSpaceAdmin,
  updateSpace,
  updateSpaceSettings,
  updateSpaceStatus,
  type SpaceDatabase
} from './repository'

function notFound(entity: 'Space' | 'AdminUser' | 'SpaceAdmin'): AppError {
  return new AppError('NOT_FOUND', `${entity} not found`)
}

async function requireSpace(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceSummary> {
  const space = await findSpaceById(db, spaceId)
  if (!space) {
    throw notFound('Space')
  }
  return space
}

async function requireSettings(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceSettings> {
  const settings = await getSpaceSettings(db, spaceId)
  if (!settings) {
    throw new AppError('INTERNAL_ERROR', 'Space settings are missing')
  }
  return settings
}

export async function listVisibleSpaces(
  db: SpaceDatabase,
  principal: AdminPrincipal
): Promise<SpaceSummary[]> {
  return listSpacesForAdmin(db, principal)
}

export async function createSpace(
  db: SpaceDatabase,
  input: CreateSpaceInput
): Promise<SpaceDetail> {
  const id = `spc_${crypto.randomUUID().replace(/-/g, '')}`
  const now = Date.now()
  const settings: SpaceSettings = {
    bookingCutoffMinutes: input.bookingCutoffMinutes,
    cancellationCutoffMinutes: input.cancellationCutoffMinutes
  }

  await createSpaceWithSettings(db, {
    id,
    name: input.name,
    timezone: input.timezone,
    settings,
    now
  })

  return {
    id,
    name: input.name,
    timezone: input.timezone,
    status: 'active',
    settings
  }
}

export async function changeSpace(
  db: SpaceDatabase,
  spaceId: string,
  patch: UpdateSpaceInput
): Promise<SpaceSummary> {
  await requireSpace(db, spaceId)
  await updateSpace(db, spaceId, patch, Date.now())
  return (await findSpaceById(db, spaceId))!
}

export async function setSpaceStatus(
  db: SpaceDatabase,
  spaceId: string,
  status: 'active' | 'disabled'
): Promise<SpaceSummary> {
  await requireSpace(db, spaceId)
  await updateSpaceStatus(db, spaceId, status, Date.now())
  return (await findSpaceById(db, spaceId))!
}

export async function readSpaceSettings(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceSettings> {
  await requireSpace(db, spaceId)
  return requireSettings(db, spaceId)
}

export async function changeSpaceSettings(
  db: SpaceDatabase,
  spaceId: string,
  patch: UpdateSpaceSettingsInput
): Promise<SpaceSettings> {
  await requireSpace(db, spaceId)
  const current = await requireSettings(db, spaceId)
  const next: SpaceSettings = {
    bookingCutoffMinutes:
      patch.bookingCutoffMinutes === undefined
        ? current.bookingCutoffMinutes
        : patch.bookingCutoffMinutes,
    cancellationCutoffMinutes:
      patch.cancellationCutoffMinutes === undefined
        ? current.cancellationCutoffMinutes
        : patch.cancellationCutoffMinutes
  }

  await updateSpaceSettings(db, spaceId, next, Date.now())
  return next
}

export async function readSpaceAdmins(
  db: SpaceDatabase,
  spaceId: string
): Promise<SpaceAdminSummary[]> {
  await requireSpace(db, spaceId)
  return listSpaceAdmins(db, spaceId)
}

export async function addSpaceAdmin(
  db: SpaceDatabase,
  spaceId: string,
  adminUserId: string
): Promise<SpaceAdminSummary> {
  await requireSpace(db, spaceId)
  const admin = await findAdminById(db, adminUserId)
  if (!admin || admin.status !== 'active') {
    throw notFound('AdminUser')
  }

  await assignSpaceAdmin(db, spaceId, adminUserId, Date.now())
  return admin
}

export async function deleteSpaceAdmin(
  db: SpaceDatabase,
  spaceId: string,
  adminUserId: string
): Promise<SpaceAdminSummary[]> {
  await requireSpace(db, spaceId)
  if (!(await hasSpaceAdminAssignment(db, spaceId, adminUserId))) {
    throw notFound('SpaceAdmin')
  }

  await removeSpaceAdmin(db, spaceId, adminUserId)
  return listSpaceAdmins(db, spaceId)
}
