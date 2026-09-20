import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockAdminApi } from '../src/services/mockAdminApi.mjs'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }
}

test('space lifecycle and settings stay isolated', async () => {
  const api = createMockAdminApi(memoryStorage())
  const before = await api.listSpaces()
  const created = await api.createSpace({
    name: '合成测试空间',
    timezone: 'Asia/Shanghai',
    settings: { bookingCutoffMinutes: 60, cancellationCutoffMinutes: 240 },
  })

  assert.equal((await api.listSpaces()).length, before.length + 1)
  assert.deepEqual(await api.getSettings(created.id), {
    bookingCutoffMinutes: 60,
    cancellationCutoffMinutes: 240,
  })

  await api.updateSettings(created.id, {
    bookingCutoffMinutes: 15,
    cancellationCutoffMinutes: null,
  })
  assert.deepEqual(await api.getSettings(created.id), {
    bookingCutoffMinutes: 15,
    cancellationCutoffMinutes: null,
  })

  assert.equal((await api.setSpaceStatus(created.id, 'disabled')).status, 'disabled')
})

test('revoking an invite preserves its source-member history', async () => {
  const api = createMockAdminApi(memoryStorage())
  const invite = (await api.listInvites('sp_demo_alpha')).find((item) => item.id === 'inv_demo_open')
  assert.ok(invite)
  assert.equal(invite.memberCount, 2)
  assert.equal((await api.listInviteMembers('sp_demo_alpha', invite.id)).length, 2)

  assert.equal((await api.revokeInvite('sp_demo_alpha', invite.id)).status, 'revoked')
  assert.equal((await api.listInviteMembers('sp_demo_alpha', invite.id)).length, 2)
})

test('space admin assignment follows the existing adminUserId contract', async () => {
  const api = createMockAdminApi(memoryStorage())
  await api.addAdmin('sp_demo_alpha', 'adm_synthetic_new')
  assert.equal((await api.listAdmins('sp_demo_alpha')).some((item) => item.id === 'adm_synthetic_new'), true)

  await api.removeAdmin('sp_demo_alpha', 'adm_synthetic_new')
  assert.equal((await api.listAdmins('sp_demo_alpha')).some((item) => item.id === 'adm_synthetic_new'), false)
})
