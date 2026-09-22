const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveEntry } = require('../lib/onboarding')

test('requires profile before Space membership', () => {
  assert.deepEqual(resolveEntry({
    profileInitialized: false,
    currentSpaceId: null,
    spaces: []
  }), {
    route: '/pages/profile/setup',
    reason: 'profile-required'
  })
})

test('blocks a profiled user without active Space at invite page', () => {
  assert.deepEqual(resolveEntry({
    profileInitialized: true,
    currentSpaceId: null,
    spaces: [{ id: 'sp_inactive', status: 'disabled' }]
  }), {
    route: '/pages/invite/index',
    reason: 'space-required'
  })
})

test('restores active current Space when available', () => {
  const result = resolveEntry({
    profileInitialized: true,
    currentSpaceId: 'sp_synthetic_a',
    spaces: [
      { id: 'sp_synthetic_a', name: 'Synthetic A', status: 'active' },
      { id: 'sp_synthetic_b', name: 'Synthetic B', status: 'active' }
    ]
  })

  assert.equal(result.route, '/pages/schedule/index')
  assert.equal(result.tab, 'schedule')
  assert.equal(result.reason, 'ready')
  assert.equal(result.currentSpace.id, 'sp_synthetic_a')
})

test('automatically selects the only active service provider when none is current', () => {
  const result = resolveEntry({
    profileInitialized: true,
    currentSpaceId: 'sp_disabled',
    spaces: [
      { id: 'sp_disabled', name: 'Synthetic Disabled', status: 'disabled' },
      { id: 'sp_active', name: 'Synthetic Active', status: 'active' }
    ]
  })

  assert.equal(result.route, '/pages/schedule/index')
  assert.equal(result.tab, 'schedule')
  assert.equal(result.reason, 'single-space-auto-selection-required')
  assert.equal(result.currentSpace, null)
  assert.equal(result.spaces.length, 1)
})

test('requires service provider selection when multiple memberships are active', () => {
  const result = resolveEntry({
    profileInitialized: true,
    currentSpaceId: null,
    spaces: [
      { id: 'sp_a', name: 'Synthetic A', status: 'active' },
      { id: 'sp_b', name: 'Synthetic B', status: 'active' }
    ]
  })

  assert.equal(result.route, '/pages/spaces/index')
  assert.equal(result.reason, 'space-selection-required')
  assert.equal(result.spaces.length, 2)
})
