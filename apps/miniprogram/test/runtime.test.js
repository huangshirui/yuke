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

test('mock API is blocked for release builds', () => {
  assert.throws(() => getApi({
    getAccountInfoSync() {
      return { miniProgram: { envVersion: 'release' } }
    }
  }), /Mock API mode is disabled/)
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
