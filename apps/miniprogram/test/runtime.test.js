const test = require('node:test')
const assert = require('node:assert/strict')
const { getApi } = require('../lib/runtime')
const { createMockApi } = require('../lib/mock-api')

function createStorage() {
  const values = new Map()
  return {
    getStorageSync(key) {
      return values.get(key)
    },
    setStorageSync(key, value) {
      values.set(key, value)
    }
  }
}

test('release runtime uses the real HTTPS Worker API', async () => {
  let captured
  const storage = createStorage()
  const api = getApi({
    ...storage,
    getAccountInfoSync() {
      return { miniProgram: { envVersion: 'release' } }
    },
    request(options) {
      captured = options
      options.success({
        statusCode: 200,
        data: {
          data: {
            tokenType: 'Bearer',
            accessToken: 'synthetic-token',
            expiresAt: '2099-01-01T00:00:00Z',
            user: { id: 'usr_synthetic' }
          }
        }
      })
    },
    uploadFile() {},
    downloadFile() {}
  })

  await api.createWeChatSession('synthetic-login-code')

  assert.equal(
    captured.url,
    'https://api.yuke.verinasci.com/v1/auth/wechat/session'
  )
})

test('mock join makes the joined Space current and switch returns backend-shaped response', async () => {
  const storage = createStorage()
  const api = createMockApi(storage)

  await api.updateProfile('Synthetic User')
  await api.uploadAvatar('/tmp/synthetic-avatar.jpg')
  const joined = await api.joinSpace('SYNTHETIC-0001')
  const user = await api.getMe()

  assert.equal(user.currentSpaceId, joined.spaceId)
  assert.equal(user.spaces.length, 1)

  await api.joinSpace('SYNTHETIC-0002')
  const switched = await api.switchSpace(joined.spaceId)
  assert.deepEqual(switched, { currentSpaceId: joined.spaceId })
})
