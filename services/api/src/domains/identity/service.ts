import type {
  UserProfile,
  WeChatSessionResponse
} from '@yuke/shared'
import { AppError, ValidationError } from '../../lib/errors'
import type { IdentityEnv } from './env'
import {
  createUser,
  findActiveUserById,
  findUserByOpenId,
  listActiveSpacesForUser,
  updateAvatarObjectKey,
  updateNickname,
  updateUnionIdIfMissing,
  type UserRecord
} from './repository'
import { issueUserToken, verifyUserToken } from './token'
import { exchangeWeChatCode } from './wechat'

const AVATAR_MAX_BYTES = 1024 * 1024
const AVATAR_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
])

function avatarUrl(user: UserRecord): string | null {
  return user.avatarObjectKey ? '/v1/me/avatar' : null
}

async function toProfile(env: IdentityEnv, user: UserRecord): Promise<UserProfile> {
  const spaces = await listActiveSpacesForUser(env.DB, user.id)
  const currentSpaceId =
    user.lastSpaceId !== null && spaces.some((space) => space.id === user.lastSpaceId)
      ? user.lastSpaceId
      : null

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: avatarUrl(user),
    profileInitialized: user.nickname.trim().length > 0 && user.avatarObjectKey !== null,
    currentSpaceId,
    spaces
  }
}

async function findOrCreateUser(
  env: IdentityEnv,
  identity: { openId: string; unionId: string | null }
): Promise<UserRecord> {
  let user = await findUserByOpenId(env.DB, identity.openId)

  if (!user) {
    try {
      user = await createUser(env.DB, identity)
    } catch (error) {
      user = await findUserByOpenId(env.DB, identity.openId)
      if (!user) {
        throw error
      }
    }
  } else {
    await updateUnionIdIfMissing(env.DB, identity.openId, identity.unionId)
  }

  if (user.status !== 'active') {
    throw new AppError('UNAUTHENTICATED', 'User account is inactive')
  }

  return user
}

export async function createWeChatSession(
  env: IdentityEnv,
  code: string
): Promise<WeChatSessionResponse> {
  const identity = await exchangeWeChatCode(code, {
    appId: env.WECHAT_APP_ID,
    appSecret: env.WECHAT_APP_SECRET
  })
  const user = await findOrCreateUser(env, identity)
  const token = await issueUserToken(user.id, env.USER_TOKEN_SECRET)

  return {
    tokenType: 'Bearer',
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
    user: await toProfile(env, user)
  }
}

export async function requireCurrentUser(env: IdentityEnv, request: Request): Promise<UserRecord> {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required')
  }

  const claims = await verifyUserToken(match[1], env.USER_TOKEN_SECRET)
  if (!claims) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token')
  }

  const user = await findActiveUserById(env.DB, claims.sub)
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token')
  }

  return user
}

export async function getCurrentUserProfile(
  env: IdentityEnv,
  request: Request
): Promise<UserProfile> {
  return toProfile(env, await requireCurrentUser(env, request))
}

export async function changeCurrentUserNickname(
  env: IdentityEnv,
  request: Request,
  nickname: string
): Promise<UserProfile> {
  const user = await requireCurrentUser(env, request)
  await updateNickname(env.DB, user.id, nickname)

  const updated = await findActiveUserById(env.DB, user.id)
  if (!updated) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token')
  }

  return toProfile(env, updated)
}

export async function saveCurrentUserAvatar(
  env: IdentityEnv,
  request: Request,
  file: File
): Promise<UserProfile> {
  const user = await requireCurrentUser(env, request)
  const extension = AVATAR_CONTENT_TYPES.get(file.type)

  if (!extension) {
    throw new ValidationError('Avatar must be JPEG, PNG, or WebP', {
      path: 'file',
      allowedContentTypes: [...AVATAR_CONTENT_TYPES.keys()]
    })
  }
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    throw new ValidationError('Avatar size must be between 1 byte and 1 MiB', {
      path: 'file',
      maxBytes: AVATAR_MAX_BYTES
    })
  }

  const newObjectKey = `avatars/${user.id}/${crypto.randomUUID()}.${extension}`
  const bytes = await file.arrayBuffer()

  await env.AVATARS.put(newObjectKey, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'private, max-age=0, must-revalidate'
    }
  })

  try {
    await updateAvatarObjectKey(env.DB, user.id, newObjectKey)
  } catch (error) {
    await env.AVATARS.delete(newObjectKey)
    throw error
  }

  if (user.avatarObjectKey && user.avatarObjectKey !== newObjectKey) {
    try {
      await env.AVATARS.delete(user.avatarObjectKey)
    } catch {
      // The new avatar is already committed in D1. A stale object is safer than
      // failing the request after the user's profile has been updated.
    }
  }

  const updated = await findActiveUserById(env.DB, user.id)
  if (!updated) {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token')
  }

  return toProfile(env, updated)
}

export async function getCurrentUserAvatar(env: IdentityEnv, request: Request): Promise<Response> {
  const user = await requireCurrentUser(env, request)
  if (!user.avatarObjectKey) {
    throw new AppError('NOT_FOUND', 'Avatar not found')
  }

  const object = await env.AVATARS.get(user.avatarObjectKey)
  if (!object) {
    throw new AppError('NOT_FOUND', 'Avatar not found')
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=0, must-revalidate')
  headers.set('x-content-type-options', 'nosniff')

  return new Response(object.body, { headers })
}
