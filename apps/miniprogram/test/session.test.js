const test = require('node:test')
const assert = require('node:assert/strict')
const { ensureCurrentUser } = require('../lib/session')
const {
  TOKEN_KEY,
  TOKEN_EXPIRES_AT_KEY,
  USER_KEY
} = require('../lib/storage')

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getStorageSync(key) {
      return values.get(key)
    },
    setStorageSync(key, value) {
      values.set(key, value)
    },
    removeStorageSync(key) {
      values.delete(key)
    },
    value(key) {
      return values.get(key)
    }
  }
}

test('refreshes the authoritative server profile when a valid token exists', async () => {
  const storage = createStorage({
    [TOKEN_KEY]: 'synthetic-token',
    [TOKEN_EXPIRES_AT_KEY]: '2099-01-01T00:00:00Z',
    [USER_KEY]: { id: 'usr_synthetic', profileInitialized: false }
  })

  let loginCalls = 0
  const authoritativeUser = {
    id: 'usr_synthetic',
    nickname: 'Synthetic User',
    avatarUrl: '/v1/me/avatar',
    profileInitialized: true,
    currentSpaceId: 'sp_synthetic',
    spaces: [{ id: 'sp_synthetic', status: 'active' }]
  }

  const user = await ensureCurrentUser({
    wxApi: {
      login() {
        loginCalls += 1
      }
    },
    api: {
      async getMe() {
        return authoritativeUser
      }
    },
    storage
  })

  assert.deepEqual(user, authoritativeUser)
  assert.deepEqual(storage.value(USER_KEY), authoritativeUser)
  assert.equal(loginCalls, 0)
})

test('bootstraps a WeChat session when local storage has no valid token', async () => {
  const storage = createStorage()
  const sessionUser = {
    id: 'usr_synthetic',
    profileInitialized: true,
    currentSpaceId: null,
    spaces: []
  }

  let sessionCode = null
  const user = await ensureCurrentUser({
    wxApi: {
      login(options) {
        options.success({ code: 'synthetic-wx-code' })
      }
    },
    api: {
      async createWeChatSession(code) {
        sessionCode = code
        return {
          accessToken: 'new-synthetic-token',
          expiresAt: '2099-01-01T00:00:00Z',
          user: sessionUser
        }
      }
    },
    storage
  })

  assert.equal(sessionCode, 'synthetic-wx-code')
  assert.equal(storage.value(TOKEN_KEY), 'new-synthetic-token')
  assert.deepEqual(storage.value(USER_KEY), sessionUser)
  assert.deepEqual(user, sessionUser)
})

test('re-authenticates when a stored token is rejected by the server', async () => {
  const storage = createStorage({
    [TOKEN_KEY]: 'stale-synthetic-token',
    [TOKEN_EXPIRES_AT_KEY]: '2099-01-01T00:00:00Z',
    [USER_KEY]: { id: 'usr_stale' }
  })

  let loginCalls = 0
  const user = await ensureCurrentUser({
    wxApi: {
      login(options) {
        loginCalls += 1
        options.success({ code: 'renewed-synthetic-code' })
      }
    },
    api: {
      async getMe() {
        const error = new Error('Authentication required')
        error.code = 'UNAUTHENTICATED'
        throw error
      },
      async createWeChatSession(code) {
        assert.equal(code, 'renewed-synthetic-code')
        return {
          accessToken: 'renewed-synthetic-token',
          expiresAt: '2099-01-01T00:00:00Z',
          user: { id: 'usr_renewed', profileInitialized: true }
        }
      }
    },
    storage
  })

  assert.equal(loginCalls, 1)
  assert.equal(storage.value(TOKEN_KEY), 'renewed-synthetic-token')
  assert.equal(user.id, 'usr_renewed')
})

test('does not hide non-authentication refresh failures behind a relogin', async () => {
  const storage = createStorage({
    [TOKEN_KEY]: 'synthetic-token',
    [TOKEN_EXPIRES_AT_KEY]: '2099-01-01T00:00:00Z'
  })

  let loginCalls = 0
  await assert.rejects(
    ensureCurrentUser({
      wxApi: {
        login() {
          loginCalls += 1
        }
      },
      api: {
        async getMe() {
          const error = new Error('Synthetic network failure')
          error.code = 'NETWORK_ERROR'
          throw error
        }
      },
      storage
    }),
    /Synthetic network failure/
  )

  assert.equal(loginCalls, 0)
  assert.equal(storage.value(TOKEN_KEY), 'synthetic-token')
})
