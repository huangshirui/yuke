import { env, exports } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

function mockWeChatCodeSession({
  openId = 'synthetic-openid-user-001',
  unionId = 'synthetic-unionid-user-001'
} = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)

    expect(url.origin + url.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session')
    expect(url.searchParams.get('appid')).toBe('synthetic-app-id')
    expect(url.searchParams.get('secret')).toBe('synthetic-app-secret-not-a-credential')
    expect(url.searchParams.get('grant_type')).toBe('authorization_code')

    return Response.json({
      openid: openId,
      unionid: unionId,
      session_key: 'synthetic-session-value'
    })
  })
}

async function login(code = 'synthetic-login-code') {
  const response = await exports.default.fetch(
    new Request('https://example.invalid/v1/auth/wechat/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code })
    })
  )

  expect(response.status).toBe(200)
  const body = await response.json()
  return body.data
}

function authorizedRequest(url, token, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return new Request(url, { ...init, headers })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WeChat user identity', () => {
  it('requires authentication for /v1/me', async () => {
    const response = await exports.default.fetch('https://example.invalid/v1/me')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' }
    })
  })

  it('exchanges a WeChat code without persisting or returning session_key', async () => {
    mockWeChatCodeSession()
    const session = await login()

    expect(session.tokenType).toBe('Bearer')
    expect(session.accessToken.split('.')).toHaveLength(3)
    expect(session.user).toMatchObject({
      nickname: '',
      avatarUrl: null,
      profileInitialized: false,
      currentSpaceId: null,
      spaces: []
    })
    expect(JSON.stringify(session)).not.toContain('session_key')
    expect(JSON.stringify(session)).not.toContain('synthetic-session-value')

    const row = await env.DB
      .prepare(
        `SELECT wechat_openid, wechat_unionid, nickname, avatar_object_key
         FROM users
         WHERE id = ?`
      )
      .bind(session.user.id)
      .first()

    expect(row).toEqual({
      wechat_openid: 'synthetic-openid-user-001',
      wechat_unionid: 'synthetic-unionid-user-001',
      nickname: '',
      avatar_object_key: null
    })

    const columns = await env.DB.prepare('PRAGMA table_info(users)').all()
    expect(columns.results.map((column) => column.name)).not.toContain('session_key')
  })

  it('reuses the existing user for the same OpenID', async () => {
    mockWeChatCodeSession({ openId: 'synthetic-openid-reuse-001', unionId: null })

    const first = await login('synthetic-login-code-a')
    const second = await login('synthetic-login-code-b')

    expect(second.user.id).toBe(first.user.id)

    const count = await env.DB
      .prepare('SELECT COUNT(*) AS count FROM users WHERE wechat_openid = ?')
      .bind('synthetic-openid-reuse-001')
      .first()

    expect(count.count).toBe(1)
  })

  it('updates nickname and stores a private R2 avatar object', async () => {
    mockWeChatCodeSession({ openId: 'synthetic-openid-profile-001' })
    const session = await login('synthetic-login-code-profile')

    const nicknameResponse = await exports.default.fetch(
      authorizedRequest('https://example.invalid/v1/me/profile', session.accessToken, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: 'Synthetic User' })
      })
    )
    expect(nicknameResponse.status).toBe(200)
    await expect(nicknameResponse.json()).resolves.toMatchObject({
      data: {
        nickname: 'Synthetic User',
        profileInitialized: false
      }
    })

    const firstForm = new FormData()
    firstForm.append(
      'file',
      new File([Uint8Array.from([137, 80, 78, 71])], 'synthetic-avatar.png', {
        type: 'image/png'
      })
    )
    const avatarResponse = await exports.default.fetch(
      authorizedRequest('https://example.invalid/v1/me/avatar', session.accessToken, {
        method: 'POST',
        body: firstForm
      })
    )

    expect(avatarResponse.status).toBe(200)
    await expect(avatarResponse.json()).resolves.toMatchObject({
      data: {
        nickname: 'Synthetic User',
        avatarUrl: '/v1/me/avatar',
        profileInitialized: true
      }
    })

    const firstRow = await env.DB
      .prepare('SELECT avatar_object_key FROM users WHERE id = ?')
      .bind(session.user.id)
      .first()
    expect(firstRow.avatar_object_key).toMatch(
      new RegExp(`^avatars/${session.user.id}/[0-9a-f-]+\\.png$`)
    )
    expect(await env.AVATARS.get(firstRow.avatar_object_key)).not.toBeNull()

    const download = await exports.default.fetch(
      authorizedRequest('https://example.invalid/v1/me/avatar', session.accessToken)
    )
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('image/png')
    expect(download.headers.get('cache-control')).toContain('private')
    expect(Array.from(new Uint8Array(await download.arrayBuffer()))).toEqual([137, 80, 78, 71])

    const secondForm = new FormData()
    secondForm.append(
      'file',
      new File([Uint8Array.from([82, 73, 70, 70])], 'synthetic-avatar.webp', {
        type: 'image/webp'
      })
    )
    const replaceResponse = await exports.default.fetch(
      authorizedRequest('https://example.invalid/v1/me/avatar', session.accessToken, {
        method: 'POST',
        body: secondForm
      })
    )
    expect(replaceResponse.status).toBe(200)

    const secondRow = await env.DB
      .prepare('SELECT avatar_object_key FROM users WHERE id = ?')
      .bind(session.user.id)
      .first()
    expect(secondRow.avatar_object_key).toMatch(/\.webp$/)
    expect(secondRow.avatar_object_key).not.toBe(firstRow.avatar_object_key)
    expect(await env.AVATARS.get(firstRow.avatar_object_key)).toBeNull()
  })

  it('rejects tampered project access tokens', async () => {
    mockWeChatCodeSession({ openId: 'synthetic-openid-token-001' })
    const session = await login('synthetic-login-code-token')
    const replacement = session.accessToken.endsWith('a') ? 'b' : 'a'
    const tampered = session.accessToken.slice(0, -1) + replacement

    const response = await exports.default.fetch(
      authorizedRequest('https://example.invalid/v1/me', tampered)
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' }
    })
  })

  it('maps an invalid WeChat login code to UNAUTHENTICATED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ errcode: 40029, errmsg: 'synthetic invalid code' })
    )

    const response = await exports.default.fetch(
      new Request('https://example.invalid/v1/auth/wechat/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'synthetic-invalid-code' })
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' }
    })
  })
})
