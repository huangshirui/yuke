import type { Resource, SlotType } from '@yuke/shared'

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

export type CatalogDatabase = {
  prepare(query: string): D1StatementLike
}

type ResourceRow = {
  id: string
  space_id: string
  name: string
  note: string | null
  status: Resource['status']
}

type SlotTypeRow = {
  id: string
  space_id: string
  name: string
  status: SlotType['status']
}

function mapResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    note: row.note,
    status: row.status
  }
}

function mapSlotType(row: SlotTypeRow): SlotType {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    status: row.status
  }
}

export async function spaceExists(
  db: CatalogDatabase,
  spaceId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM spaces WHERE id = ? LIMIT 1')
    .bind(spaceId)
    .first<{ found: number }>()

  return row?.found === 1
}

export async function listResources(
  db: CatalogDatabase,
  spaceId: string,
  options: { activeOnly?: boolean } = {}
): Promise<Resource[]> {
  const statement = options.activeOnly
    ? db.prepare(`
        SELECT id, space_id, name, note, status
        FROM resources
        WHERE space_id = ?
          AND status = 'active'
        ORDER BY created_at ASC, id ASC
      `).bind(spaceId)
    : db.prepare(`
        SELECT id, space_id, name, note, status
        FROM resources
        WHERE space_id = ?
        ORDER BY created_at ASC, id ASC
      `).bind(spaceId)

  const result = await statement.all<ResourceRow>()
  return (result.results ?? []).map(mapResource)
}

export async function findResourceById(
  db: CatalogDatabase,
  spaceId: string,
  resourceId: string
): Promise<Resource | null> {
  const row = await db
    .prepare(`
      SELECT id, space_id, name, note, status
      FROM resources
      WHERE id = ?
        AND space_id = ?
      LIMIT 1
    `)
    .bind(resourceId, spaceId)
    .first<ResourceRow>()

  return row ? mapResource(row) : null
}

export async function insertResource(
  db: CatalogDatabase,
  resource: Resource,
  now: number
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO resources
        (id, space_id, name, note, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      resource.id,
      resource.spaceId,
      resource.name,
      resource.note,
      resource.status,
      now,
      now
    )
    .run()
}

export async function updateResource(
  db: CatalogDatabase,
  resource: Resource,
  now: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE resources
      SET name = ?,
          note = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
    `)
    .bind(
      resource.name,
      resource.note,
      resource.status,
      now,
      resource.id,
      resource.spaceId
    )
    .run()
}

export async function listSlotTypes(
  db: CatalogDatabase,
  spaceId: string
): Promise<SlotType[]> {
  const result = await db
    .prepare(`
      SELECT id, space_id, name, status
      FROM slot_types
      WHERE space_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .bind(spaceId)
    .all<SlotTypeRow>()

  return (result.results ?? []).map(mapSlotType)
}

export async function findSlotTypeById(
  db: CatalogDatabase,
  spaceId: string,
  slotTypeId: string
): Promise<SlotType | null> {
  const row = await db
    .prepare(`
      SELECT id, space_id, name, status
      FROM slot_types
      WHERE id = ?
        AND space_id = ?
      LIMIT 1
    `)
    .bind(slotTypeId, spaceId)
    .first<SlotTypeRow>()

  return row ? mapSlotType(row) : null
}

export async function findSlotTypeByName(
  db: CatalogDatabase,
  spaceId: string,
  name: string
): Promise<SlotType | null> {
  const row = await db
    .prepare(`
      SELECT id, space_id, name, status
      FROM slot_types
      WHERE space_id = ?
        AND name = ?
      LIMIT 1
    `)
    .bind(spaceId, name)
    .first<SlotTypeRow>()

  return row ? mapSlotType(row) : null
}

export async function insertSlotType(
  db: CatalogDatabase,
  slotType: SlotType,
  now: number
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO slot_types
        (id, space_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      slotType.id,
      slotType.spaceId,
      slotType.name,
      slotType.status,
      now,
      now
    )
    .run()
}

export async function updateSlotType(
  db: CatalogDatabase,
  slotType: SlotType,
  now: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE slot_types
      SET name = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
        AND space_id = ?
    `)
    .bind(
      slotType.name,
      slotType.status,
      now,
      slotType.id,
      slotType.spaceId
    )
    .run()
}
