import { ValidationError } from '../../lib/errors'
import { ok } from '../../lib/http'
import type { Router } from '../../lib/router'
import {
  expectObject,
  parseJsonBody,
  requireString
} from '../../lib/validation'
import type { IdentityEnv } from './env'
import {
  changeCurrentUserNickname,
  createWeChatSession,
  getCurrentUserAvatar,
  getCurrentUserProfile,
  requireCurrentUser,
  saveCurrentUserAvatar
} from './service'

function parseWeChatSessionInput(value: unknown): { code: string } {
  const body = expectObject(value)
  return {
    code: requireString(body, 'code', { maxLength: 256 })
  }
}

function parseProfileUpdate(value: unknown): { nickname: string } {
  const body = expectObject(value)
  return {
    nickname: requireString(body, 'nickname', { maxLength: 64 })
  }
}

async function parseAvatarFile(request: Request): Promise<File> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new ValidationError('Request body must be multipart/form-data')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('file must be an uploaded image', { path: 'file' })
  }
  return file
}

export function registerIdentityRoutes(app: Router<IdentityEnv>): void {
  app.post('/v1/auth/wechat/session', async ({ request, env }) => {
    const input = await parseJsonBody(request, parseWeChatSessionInput)
    return ok(await createWeChatSession(env, input.code))
  })

  app.get('/v1/me', async ({ request, env }) => ok(await getCurrentUserProfile(env, request)))

  app.patch('/v1/me/profile', async ({ request, env }) => {
    const input = await parseJsonBody(request, parseProfileUpdate)
    return ok(await changeCurrentUserNickname(env, request, input.nickname))
  })

  app.post('/v1/me/avatar', async ({ request, env }) => {
    await requireCurrentUser(env, request)
    const file = await parseAvatarFile(request)
    return ok(await saveCurrentUserAvatar(env, request, file))
  })

  app.get('/v1/me/avatar', async ({ request, env }) => getCurrentUserAvatar(env, request))
}
