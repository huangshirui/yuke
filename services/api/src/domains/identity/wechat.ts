import { AppError } from '../../lib/errors'

const CODE_TO_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session'

export type WeChatIdentity = {
  openId: string
  unionId: string | null
}

type WeChatCodeSessionResponse = {
  openid?: unknown
  unionid?: unknown
  session_key?: unknown
  errcode?: unknown
}

function requireRuntimeSecret(value: string | undefined): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError('INTERNAL_ERROR', 'Internal Server Error')
  }
  return value
}

export async function exchangeWeChatCode(
  code: string,
  config: { appId: string; appSecret: string },
  fetcher: typeof fetch = fetch
): Promise<WeChatIdentity> {
  const appId = requireRuntimeSecret(config.appId)
  const appSecret = requireRuntimeSecret(config.appSecret)

  const url = new URL(CODE_TO_SESSION_URL)
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')

  let response: Response
  try {
    response = await fetcher(url, { method: 'GET' })
  } catch {
    throw new AppError('INTERNAL_ERROR', 'Internal Server Error')
  }

  if (!response.ok) {
    throw new AppError('INTERNAL_ERROR', 'Internal Server Error')
  }

  let payload: WeChatCodeSessionResponse
  try {
    payload = (await response.json()) as WeChatCodeSessionResponse
  } catch {
    throw new AppError('INTERNAL_ERROR', 'Internal Server Error')
  }

  if (
    typeof payload.errcode === 'number' ||
    typeof payload.openid !== 'string' ||
    payload.openid.length === 0 ||
    typeof payload.session_key !== 'string' ||
    payload.session_key.length === 0
  ) {
    throw new AppError('UNAUTHENTICATED', 'WeChat login failed')
  }

  return {
    openId: payload.openid,
    unionId: typeof payload.unionid === 'string' && payload.unionid.length > 0 ? payload.unionid : null
  }
}
