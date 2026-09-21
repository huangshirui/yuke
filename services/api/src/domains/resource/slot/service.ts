import type { AdminSlot, CreateSlotInput, Slot, SlotStatus } from '@yuke/shared'
import { AppError, ValidationError } from '../../../lib/errors'
import {
  findResourceById,
  findSlotTypeById,
  type CatalogDatabase
} from '../catalog/repository'
import {
  findSlotById,
  findSpaceTimezone,
  insertSlot,
  listAdminSlotsByLocalDateRange,
  listAdminSlotsByResourceRange,
  updateSlot,
  type SlotDatabase,
  type SlotRecord
} from './repository'
import type { UpdateSingleSlotInput } from './validation'

type ResourceSlotDatabase = SlotDatabase & CatalogDatabase

function databaseError(error: unknown): never {
  if (error instanceof Error && error.message.includes('SLOT_OVERLAP')) {
    throw new AppError('SLOT_OVERLAP', '该预约对象在这个时间已经存在时段。')
  }
  if (error instanceof Error && error.message.includes('SLOT_HAS_ACTIVE_BOOKING')) {
    throw new AppError('SLOT_NOT_BOOKABLE', '这个时段已有有效预约，不能直接取消。')
  }
  throw error
}

function toEpoch(value: string, path: string): number {
  const result = Date.parse(value)
  if (!Number.isFinite(result)) {
    throw new ValidationError(`${path} must be a valid ISO 8601 timestamp`, { path })
  }
  return result
}

function assertRange(startAt: number, endAt: number): void {
  if (endAt <= startAt) {
    throw new ValidationError('endAt must be later than startAt', { path: 'endAt' })
  }
}

function localDateFor(epochMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(epochMs))
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function requireActiveCatalog(
  db: ResourceSlotDatabase,
  spaceId: string,
  resourceId: string,
  slotTypeId: string
): Promise<{ timezone: string }> {
  const [timezone, resource, slotType] = await Promise.all([
    findSpaceTimezone(db, spaceId),
    findResourceById(db, spaceId, resourceId),
    findSlotTypeById(db, spaceId, slotTypeId)
  ])
  if (!timezone) throw new AppError('NOT_FOUND', 'Space not found')
  if (!resource) throw new AppError('NOT_FOUND', 'Resource not found')
  if (!slotType) throw new AppError('NOT_FOUND', 'SlotType not found')
  if (resource.status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的预约对象不能创建新时段。')
  }
  if (slotType.status !== 'active') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已停用的时段类型不能用于新时段。')
  }
  return { timezone }
}

async function requireSlot(
  db: SlotDatabase,
  spaceId: string,
  slotId: string
): Promise<SlotRecord> {
  const slot = await findSlotById(db, spaceId, slotId)
  if (!slot) throw new AppError('NOT_FOUND', 'Slot not found')
  return slot
}

export async function createAdminSlot(
  db: ResourceSlotDatabase,
  spaceId: string,
  adminId: string,
  input: CreateSlotInput
): Promise<SlotRecord> {
  const { timezone } = await requireActiveCatalog(
    db,
    spaceId,
    input.resourceId,
    input.slotTypeId
  )
  const startAt = toEpoch(input.startAt, 'startAt')
  const endAt = toEpoch(input.endAt, 'endAt')
  assertRange(startAt, endAt)

  const id = `slot_${crypto.randomUUID().replace(/-/g, '')}`
  try {
    await insertSlot(db, {
      id,
      spaceId,
      resourceId: input.resourceId,
      slotTypeId: input.slotTypeId,
      startAt,
      endAt,
      localDate: localDateFor(startAt, timezone),
      createdByAdminId: adminId,
      now: Date.now()
    })
  } catch (error) {
    databaseError(error)
  }
  return (await requireSlot(db, spaceId, id))
}

export async function changeAdminSingleSlot(
  db: ResourceSlotDatabase,
  spaceId: string,
  slotId: string,
  patch: UpdateSingleSlotInput
): Promise<SlotRecord> {
  const current = await requireSlot(db, spaceId, slotId)
  if (current.status === 'cancelled') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已取消的时段不能再修改。')
  }
  if (current.seriesId && patch.scope !== 'single') {
    throw new ValidationError('周期时段仅本次修改必须明确 scope=single', { path: 'scope' })
  }

  const slotTypeId = patch.slotTypeId ?? current.slotTypeId
  const { timezone } = await requireActiveCatalog(
    db,
    spaceId,
    current.resourceId,
    slotTypeId
  )
  const startAt = patch.startAt ? toEpoch(patch.startAt, 'startAt') : Date.parse(current.startAt)
  const endAt = patch.endAt ? toEpoch(patch.endAt, 'endAt') : Date.parse(current.endAt)
  assertRange(startAt, endAt)

  try {
    await updateSlot(db, {
      id: current.id,
      spaceId,
      slotTypeId,
      startAt,
      endAt,
      localDate: localDateFor(startAt, timezone),
      status: current.status,
      isSeriesException: current.isSeriesException || Boolean(current.seriesId),
      now: Date.now()
    })
  } catch (error) {
    databaseError(error)
  }
  return requireSlot(db, spaceId, slotId)
}

export async function setAdminSlotStatus(
  db: SlotDatabase,
  spaceId: string,
  slotId: string,
  status: Exclude<SlotStatus, 'cancelled'>
): Promise<SlotRecord> {
  const current = await requireSlot(db, spaceId, slotId)
  if (current.status === 'cancelled') {
    throw new AppError('SLOT_NOT_BOOKABLE', '已取消的时段不能重新启用。')
  }
  try {
    await updateSlot(db, {
      id: current.id,
      spaceId,
      slotTypeId: current.slotTypeId,
      startAt: Date.parse(current.startAt),
      endAt: Date.parse(current.endAt),
      localDate: current.localDate,
      status,
      isSeriesException: current.isSeriesException,
      now: Date.now()
    })
  } catch (error) {
    databaseError(error)
  }
  return requireSlot(db, spaceId, slotId)
}

export async function cancelAdminSlot(
  db: SlotDatabase,
  spaceId: string,
  slotId: string
): Promise<SlotRecord> {
  const current = await requireSlot(db, spaceId, slotId)
  if (current.status === 'cancelled') return current
  try {
    await updateSlot(db, {
      id: current.id,
      spaceId,
      slotTypeId: current.slotTypeId,
      startAt: Date.parse(current.startAt),
      endAt: Date.parse(current.endAt),
      localDate: current.localDate,
      status: 'cancelled',
      isSeriesException: current.isSeriesException,
      now: Date.now()
    })
  } catch (error) {
    databaseError(error)
  }
  return requireSlot(db, spaceId, slotId)
}

export async function listAdminSlots(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  startAt: number,
  endAt: number
): Promise<AdminSlot[]> {
  return listAdminSlotsByResourceRange(db, spaceId, resourceId, startAt, endAt)
}

export async function listAdminSlotsByLocalDateRange(
  db: SlotDatabase,
  spaceId: string,
  resourceId: string,
  from: string,
  to: string
): Promise<AdminSlot[]> {
  return listAdminSlotsByLocalDateRange(db, spaceId, resourceId, from, to)
}
