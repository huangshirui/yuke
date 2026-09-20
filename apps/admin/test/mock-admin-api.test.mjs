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


test('resource and slot type lifecycle keep inactive history visible', async () => {
  const api = createMockAdminApi(memoryStorage())

  const resource = await api.createResource('sp_demo_alpha', {
    name: '合成预约对象',
    note: 'Synthetic resource note.',
  })
  assert.equal(resource.status, 'active')
  assert.equal((await api.updateResource('sp_demo_alpha', resource.id, {
    name: '合成预约对象（更新）',
    note: null,
  })).name, '合成预约对象（更新）')
  assert.equal((await api.setResourceStatus('sp_demo_alpha', resource.id, 'inactive')).status, 'inactive')
  assert.equal((await api.listResources('sp_demo_alpha')).some((item) => item.id === resource.id), true)

  const slotType = await api.createSlotType('sp_demo_alpha', { name: '合成类型' })
  assert.equal(slotType.status, 'active')
  assert.equal((await api.updateSlotType('sp_demo_alpha', slotType.id, { name: '合成类型（更新）' })).name, '合成类型（更新）')
  assert.equal((await api.setSlotTypeStatus('sp_demo_alpha', slotType.id, 'inactive')).status, 'inactive')
  assert.equal((await api.listSlotTypes('sp_demo_alpha')).some((item) => item.id === slotType.id), true)
})

test('member views filter by invite source and keep internal notes separate', async () => {
  const api = createMockAdminApi(memoryStorage())

  const byAdmin = await api.listMembers('sp_demo_alpha', { invitedByAdminId: 'adm_demo_ops' })
  assert.deepEqual(byAdmin.map((item) => item.membershipId), ['mem_demo_03'])

  const byInvite = await api.listMembers('sp_demo_alpha', { inviteCodeId: 'inv_demo_open' })
  assert.deepEqual(byInvite.map((item) => item.membershipId), ['mem_demo_01', 'mem_demo_02'])

  await api.updateMemberAdminNote('sp_demo_alpha', 'mem_demo_01', 'Synthetic member internal note.')
  await api.updateParticipantAdminNote('sp_demo_alpha', 'par_demo_01', 'Synthetic participant internal note.')

  const member = await api.getMember('sp_demo_alpha', 'mem_demo_01')
  assert.equal(member.adminNote, 'Synthetic member internal note.')
  assert.equal(member.participants.find((item) => item.id === 'par_demo_01')?.adminNote, 'Synthetic participant internal note.')
  assert.equal(member.participants.find((item) => item.id === 'par_demo_01')?.userNote, 'Synthetic user note.')
})

test('weekly scheduling mock enforces overlap and frozen visibility', async () => {
  const api = createMockAdminApi(memoryStorage())
  const created = await api.createScheduleSlot('sp_demo_alpha', {
    resourceId: 'res_demo_aurora',
    slotTypeId: 'sty_demo_standard',
    startAt: '2026-09-23T01:00:00.000Z',
    endAt: '2026-09-23T02:00:00.000Z',
  })
  assert.equal(created.status, 'open')
  await assert.rejects(
    api.createScheduleSlot('sp_demo_alpha', {
      resourceId: 'res_demo_aurora',
      slotTypeId: 'sty_demo_standard',
      startAt: '2026-09-23T01:30:00.000Z',
      endAt: '2026-09-23T02:30:00.000Z',
    }),
    /已经存在时段/
  )
  const frozen = await api.setScheduleSlotFrozen('sp_demo_alpha', created.id, true)
  assert.equal(frozen.status, 'frozen')
  assert.equal(frozen.bookable, false)
})
