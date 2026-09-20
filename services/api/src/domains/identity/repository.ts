import type { SpaceSummary } from '@yuke/shared'
import type { D1DatabaseLike } from './env'

export type UserRecord = {
  id: string
  nickname: string
  avatarObjectKey: string | null
  lastSpaceId: string | null
  status: 'active' | 'inactive'
  updatedAt: number
}

type UserRow = {
  id: string
  nickname: string
  avatar_object_key: string | null
  last_space_id: string | null
  status: 'active' | 'inactive'
  updated_at: number
}

type SpaceRow = {
  id: string
  name: string
  timezone: string
  status: 'active' | 'disabled'
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    nickname: row.nickname,
    avatarObjectKey: row.avatar_object_key,
    lastSpaceId: row.last_space_id,
    status: row.status,
    updatedAt: row.updated_at
  }
}

export async function findUserByOpenId(db: D1DatabaseLike, openId: string): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, nickname, avatar_object_key, last_space_id, status, updated_at
       FROM users
       WHERE wechat_openid = ?`
    )
    .bind(openId)
    .first<UserRow>()

  return row ? mapUser(row) : null
}

export async function findActiveUserById(db: D1DatabaseLike, userId: string): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, nickname, avatar_object_key, last_space_id, status, updated_at
       FROM users
       WHERE id = ? AND status = 'active'`
    )
    .bind(userId)
    .first<UserRow>()

  return row ? mapUser(row) : null
}

export async function createUser(
  db: D1DatabaseLike,
  identity: { openId: string; unionId: string | null }
): Promise<UserRecord> {
  const id = `usr_${crypto.randomUUID().replace(/-/g, '')}`
  const now = Date.now()

  await db
    .prepare(
      `INSERT INTO users (
         id, wechat_openid, wechat_unionid, nickname, avatar_object_key,
         last_space_id, status, created_at, updated_at
       ) VALUES (?, ?, ?, '', NULL, NULL, 'active', ?, ?)`
    )
    .bind(id, identity.openId, identity.unionId, now, now)
    .run()

  return {
    id,
    nickname: '',
    avatarObjectKey: null,
    lastSpaceId: null,
    status: 'active',
    updatedAt: now
  }
}

export async function updateUnionIdIfMissing(
  db: D1DatabaseLike,
  openId: string,
  unionId: string | null
): Promise<void> {
  if (unionId === null) {
    return
  }

  await db
    .prepare(
      `UPDATE users
       SET wechat_unionid = COALESCE(wechat_unionid, ?), updated_at = ?
       WHERE wechat_openid = ?`
    )
    .bind(unionId, Date.now(), openId)
    .run()
}

export async function updateNickname(
  db: D1DatabaseLike,
  userId: string,
  nickname: string
): Promise<void> {
  await db
    .prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ? AND status = \'active\'')
    .bind(nickname, Date.now(), userId)
    .run()
}

export async function updateAvatarObjectKey(
  db: D1DatabaseLike,
  userId: string,
  objectKey: string
): Promise<void> {
  await db
    .prepare(
      'UPDATE users SET avatar_object_key = ?, updated_at = ? WHERE id = ? AND status = \'active\''
    )
    .bind(objectKey, Date.now(), userId)
    .run()
}

export async function listActiveSpacesForUser(
  db: D1DatabaseLike,
  userId: string
): Promise<SpaceSummary[]> {
  const result = await db
    .prepare(
      `SELECT spaces.id, spaces.name, spaces.timezone, spaces.status
       FROM space_memberships
       JOIN spaces ON spaces.id = space_memberships.space_id
       WHERE space_memberships.user_id = ?
         AND space_memberships.status = 'active'
       ORDER BY space_memberships.joined_at ASC`
    )
    .bind(userId)
    .all<SpaceRow>()

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    status: row.status
  }))
}
