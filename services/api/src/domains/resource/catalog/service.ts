import type {
  CreateResourceInput,
  CreateSlotTypeInput,
  Resource,
  SlotType,
  UpdateResourceInput,
  UpdateSlotTypeInput
} from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import type { IdentityEnv } from '../../identity/env'
import { requireCurrentUser } from '../../identity/service'
import {
  findMembershipByUserAndSpace
} from '../../tenant/membership/repository'
import type { TenantDatabase } from '../../tenant/invite/repository'
import {
  findResourceById,
  findSlotTypeById,
  findSlotTypeByName,
  insertResource,
  insertSlotType,
  listResources,
  listSlotTypes,
  spaceExists,
  updateResource,
  updateSlotType,
  type CatalogDatabase
} from './repository'

function notFound(entity: 'Space' | 'Resource' | 'SlotType'): AppError {
  return new AppError('NOT_FOUND', `${entity} not found`)
}

async function requireSpace(
  db: CatalogDatabase,
  spaceId: string
): Promise<void> {
  if (!(await spaceExists(db, spaceId))) {
    throw notFound('Space')
  }
}

function isSlotTypeNameConflict(error: unknown): boolean {
  return error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: slot_types.space_id, slot_types.name')
}

async function requireResource(
  db: CatalogDatabase,
  spaceId: string,
  resourceId: string
): Promise<Resource> {
  const resource = await findResourceById(db, spaceId, resourceId)
  if (!resource) {
    throw notFound('Resource')
  }
  return resource
}

async function requireSlotType(
  db: CatalogDatabase,
  spaceId: string,
  slotTypeId: string
): Promise<SlotType> {
  const slotType = await findSlotTypeById(db, spaceId, slotTypeId)
  if (!slotType) {
    throw notFound('SlotType')
  }
  return slotType
}

async function assertSlotTypeNameAvailable(
  db: CatalogDatabase,
  spaceId: string,
  name: string,
  currentId?: string
): Promise<void> {
  const existing = await findSlotTypeByName(db, spaceId, name)
  if (existing && existing.id !== currentId) {
    throw new ValidationError('Slot Type name already exists in this Space', {
      path: 'name'
    })
  }
}

export async function listAdminResources(
  db: CatalogDatabase,
  spaceId: string
): Promise<Resource[]> {
  await requireSpace(db, spaceId)
  return listResources(db, spaceId)
}

export async function createAdminResource(
  db: CatalogDatabase,
  spaceId: string,
  input: CreateResourceInput
): Promise<Resource> {
  await requireSpace(db, spaceId)
  const resource: Resource = {
    id: `res_${crypto.randomUUID().replace(/-/g, '')}`,
    spaceId,
    name: input.name,
    note: input.note ?? null,
    status: 'active'
  }

  await insertResource(db, resource, Date.now())
  return resource
}

export async function changeAdminResource(
  db: CatalogDatabase,
  spaceId: string,
  resourceId: string,
  patch: UpdateResourceInput
): Promise<Resource> {
  const current = await requireResource(db, spaceId, resourceId)
  const next: Resource = {
    ...current,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.note === undefined ? {} : { note: patch.note })
  }

  await updateResource(db, next, Date.now())
  return next
}

export async function setAdminResourceStatus(
  db: CatalogDatabase,
  spaceId: string,
  resourceId: string,
  status: Resource['status']
): Promise<Resource> {
  const current = await requireResource(db, spaceId, resourceId)
  const next: Resource = { ...current, status }

  if (current.status !== status) {
    await updateResource(db, next, Date.now())
  }
  return next
}

export async function listAdminSlotTypes(
  db: CatalogDatabase,
  spaceId: string
): Promise<SlotType[]> {
  await requireSpace(db, spaceId)
  return listSlotTypes(db, spaceId)
}

export async function createAdminSlotType(
  db: CatalogDatabase,
  spaceId: string,
  input: CreateSlotTypeInput
): Promise<SlotType> {
  await requireSpace(db, spaceId)
  await assertSlotTypeNameAvailable(db, spaceId, input.name)

  const slotType: SlotType = {
    id: `sty_${crypto.randomUUID().replace(/-/g, '')}`,
    spaceId,
    name: input.name,
    status: 'active'
  }

  try {
    await insertSlotType(db, slotType, Date.now())
  } catch (error) {
    if (isSlotTypeNameConflict(error)) {
      throw new ValidationError('Slot Type name already exists in this Space', {
        path: 'name'
      })
    }
    throw error
  }
  return slotType
}

export async function changeAdminSlotType(
  db: CatalogDatabase,
  spaceId: string,
  slotTypeId: string,
  patch: UpdateSlotTypeInput
): Promise<SlotType> {
  const current = await requireSlotType(db, spaceId, slotTypeId)
  const name = patch.name ?? current.name

  await assertSlotTypeNameAvailable(db, spaceId, name, current.id)

  const next: SlotType = {
    ...current,
    name
  }

  try {
    await updateSlotType(db, next, Date.now())
  } catch (error) {
    if (isSlotTypeNameConflict(error)) {
      throw new ValidationError('Slot Type name already exists in this Space', {
        path: 'name'
      })
    }
    throw error
  }
  return next
}

export async function setAdminSlotTypeStatus(
  db: CatalogDatabase,
  spaceId: string,
  slotTypeId: string,
  status: SlotType['status']
): Promise<SlotType> {
  const current = await requireSlotType(db, spaceId, slotTypeId)
  const next: SlotType = { ...current, status }

  if (current.status !== status) {
    await updateSlotType(db, next, Date.now())
  }
  return next
}

export async function listCurrentUserResources(
  env: IdentityEnv,
  request: Request,
  spaceId: string
): Promise<Resource[]> {
  const user = await requireCurrentUser(env, request)
  const membership = await findMembershipByUserAndSpace(
    env.DB as unknown as TenantDatabase,
    user.id,
    spaceId
  )

  if (!membership || membership.status !== 'active') {
    throw new AppError(
      'SPACE_ACCESS_DENIED',
      'Active Space membership is required'
    )
  }

  return listResources(
    env.DB as unknown as CatalogDatabase,
    spaceId,
    { activeOnly: true }
  )
}
