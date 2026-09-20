const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isBirthMonth,
  normalizeParticipantInput,
  bookableParticipants,
  sortParticipants
} = require('../lib/participants')

test('validates birth month as YYYY-MM', () => {
  assert.equal(isBirthMonth('2012-09'), true)
  assert.equal(isBirthMonth('2012-13'), false)
  assert.equal(isBirthMonth('12-09'), false)
  assert.equal(isBirthMonth('synthetic'), false)
})

test('normalizes participant input', () => {
  assert.deepEqual(normalizeParticipantInput({
    name: '  Synthetic Person  ',
    birthMonth: '2012-09',
    note: '  Synthetic note  '
  }), {
    name: 'Synthetic Person',
    birthMonth: '2012-09',
    note: 'Synthetic note'
  })
})

test('bookable participant selector excludes inactive participants', () => {
  const participants = [
    { id: 'par_active', name: 'Synthetic Active', status: 'active' },
    { id: 'par_inactive', name: 'Synthetic Inactive', status: 'inactive' }
  ]

  assert.deepEqual(bookableParticipants(participants).map((item) => item.id), ['par_active'])
})

test('sorts active participants before inactive participants', () => {
  const participants = sortParticipants([
    { id: 'par_b', name: 'B', status: 'inactive' },
    { id: 'par_a', name: 'A', status: 'active' }
  ])

  assert.deepEqual(participants.map((item) => item.id), ['par_a', 'par_b'])
})
