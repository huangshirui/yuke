const test = require('node:test')
const assert = require('node:assert/strict')
const { createMockApi } = require('../lib/mock-api')

function createStorage() {
  const values = new Map()
  return {
    getStorageSync(key) {
      return values.get(key)
    },
    setStorageSync(key, value) {
      values.set(key, JSON.parse(JSON.stringify(value)))
    }
  }
}

test('mock participant data is isolated by Space and supports deactivate/activate', async () => {
  const storage = createStorage()
  const api = createMockApi(storage)

  await api.updateProfile('Synthetic User')
  await api.uploadAvatar('/tmp/synthetic-avatar.png')
  await api.joinSpace('SPACE-A')
  const userA = await api.getMe()
  const spaceA = userA.currentSpaceId

  const participant = await api.createParticipant(spaceA, {
    name: 'Synthetic Participant',
    birthMonth: '2012-09',
    note: null
  })

  await api.joinSpace('SPACE-B')
  const userB = await api.getMe()
  const spaceB = userB.currentSpaceId

  assert.equal((await api.listParticipants(spaceA)).length, 1)
  assert.equal((await api.listParticipants(spaceB)).length, 0)

  await api.deactivateParticipant(spaceA, participant.id)
  assert.equal((await api.listParticipants(spaceA))[0].status, 'inactive')

  await api.activateParticipant(spaceA, participant.id)
  assert.equal((await api.listParticipants(spaceA))[0].status, 'active')
})
