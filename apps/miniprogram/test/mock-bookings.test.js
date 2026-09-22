const test = require('node:test')
const assert = require('node:assert/strict')
const { createMockApi } = require('../lib/mock-api')

function createStorage() {
  const values = new Map()
  return {
    getStorageSync(key) { return values.get(key) },
    setStorageSync(key, value) { values.set(key, value) }
  }
}

test('mock booking lifecycle supports create, list, conflict and cancel', async () => {
  const storage = createStorage()
  const api = createMockApi(storage)

  await api.updateProfile('Synthetic User')
  await api.uploadAvatar('/tmp/synthetic-avatar.jpg')
  const joined = await api.joinSpace('SYNTHETIC-BOOK')
  const spaceId = joined.spaceId
  const participant = await api.createParticipant(spaceId, {
    name: '参与人甲',
    birthMonth: '2014-03',
    note: null
  })
  const resource = (await api.listResources(spaceId))[0]
  const slots = await api.listResourceSlots(
    spaceId,
    resource.id,
    '2026-09-21',
    '2026-09-23'
  )
  const slot = slots.find((item) => item.bookable)
  assert.ok(slot)

  const booking = await api.createBooking(spaceId, {
    slotId: slot.id,
    participantId: participant.id
  })
  assert.equal(booking.status, 'booked')
  assert.equal((await api.listBookings(spaceId, { status: 'booked' })).length, 1)

  await assert.rejects(
    api.createBooking(spaceId, {
      slotId: slot.id,
      participantId: participant.id
    }),
    (error) => error.code === 'SLOT_ALREADY_BOOKED'
  )

  assert.equal((await api.cancelBooking(spaceId, booking.id)).status, 'cancelled')
  assert.equal((await api.getBooking(spaceId, booking.id)).status, 'cancelled')
})
