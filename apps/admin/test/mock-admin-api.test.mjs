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

test('current admin identity and email-based space assignment stay stable', async () => {
  const api = createMockAdminApi(memoryStorage())

  assert.deepEqual(await api.getCurrentAdmin(), {
    id: 'adm_demo_super',
    email: 'super-admin@example.invalid',
    platformRole: 'super_admin',
  })

  const assigned = await api.assignAdminByEmail('sp_demo_alpha', 'New.Admin@Example.Invalid')
  assert.equal(assigned.email, 'new.admin@example.invalid')
  assert.equal(
    (await api.listAdmins('sp_demo_alpha')).filter((item) => item.email === assigned.email).length,
    1,
  )

  const again = await api.assignAdminByEmail('sp_demo_alpha', 'new.admin@example.invalid')
  assert.equal(again.id, assigned.id)

  await api.removeAdmin('sp_demo_alpha', assigned.id)
  assert.equal((await api.listAdmins('sp_demo_alpha')).some((item) => item.id === assigned.id), false)
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


test('admin shell mock exposes current identity and assigns admins by email', async () => {
  const api = createMockAdminApi(memoryStorage())

  const current = await api.getCurrentAdmin()
  assert.equal(current.email, 'super-admin@example.invalid')
  assert.equal(current.platformRole, 'super_admin')

  const assigned = await api.assignAdminByEmail('sp_demo_alpha', 'NEW-ADMIN@example.invalid')
  assert.equal(assigned.email, 'new-admin@example.invalid')

  const admins = await api.listAdmins('sp_demo_alpha')
  assert.ok(admins.some((item) => item.email === 'new-admin@example.invalid'))

  const same = await api.assignAdminByEmail('sp_demo_alpha', 'new-admin@example.invalid')
  assert.equal(same.id, assigned.id)
})

test('booking management mock filters, moves, cancels and completes bookings', async () => {
  const api = createMockAdminApi(memoryStorage())

  const initial = await api.listBookings('sp_demo_alpha', { status: 'booked' })
  assert.equal(initial.length, 1)
  assert.equal(initial[0].membershipId, 'mem_demo_01')

  const memberBookings = await api.listBookings('sp_demo_alpha', { membershipId: 'mem_demo_01' })
  assert.equal(memberBookings.length, 1)
  assert.equal((await api.listBookings('sp_demo_alpha', { membershipId: 'mem_missing' })).length, 0)

  const projectedSlots = await api.listScheduleSlots(
    'sp_demo_alpha',
    'res_demo_aurora',
    '2026-09-22',
    '2026-09-22',
  )
  assert.equal(projectedSlots.length, 1)
  assert.equal(projectedSlots[0].booking?.id, initial[0].id)
  assert.equal(projectedSlots[0].booking?.participantName, initial[0].participant.name)

  const moved = await api.updateBooking('sp_demo_alpha', initial[0].id, {
    slotId: 'slot_demo_alt',
    participantId: 'par_demo_01',
  })
  assert.equal(moved.slotId, 'slot_demo_alt')

  const completed = await api.completeBooking('sp_demo_alpha', moved.id)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.completion?.source, 'manual')
  assert.equal(completed.reconciliation?.status, 'pending')
  assert.equal((await api.listBookings('sp_demo_alpha', { status: 'completed' })).length, 1)
  assert.equal((await api.listBookings('sp_demo_alpha', { reconciliationStatus: 'pending' })).length, 1)

  const settled = await api.reconcileBooking('sp_demo_alpha', moved.id)
  assert.equal(settled.reconciliation?.status, 'settled')
  assert.equal((await api.listBookings('sp_demo_alpha', { reconciliationStatus: 'settled' })).length, 1)

  const settledSlots = await api.listScheduleSlots(
    'sp_demo_alpha',
    'res_demo_aurora',
    '2026-09-26',
    '2026-09-26',
  )
  assert.equal(settledSlots[0].booking?.reconciliationStatus, 'settled')

  const freshApi = createMockAdminApi(memoryStorage())
  await assert.rejects(
    freshApi.cancelScheduleSlot('sp_demo_alpha', 'slot_demo_single'),
    /先取消预约/
  )
  const fresh = (await freshApi.listBookings('sp_demo_alpha', { status: 'booked' }))[0]
  assert.equal((await freshApi.cancelBooking('sp_demo_alpha', fresh.id)).status, 'cancelled')
  assert.equal(
    (await freshApi.cancelScheduleSlot('sp_demo_alpha', 'slot_demo_single')).status,
    'cancelled'
  )
})
