const test = require('node:test')
const assert = require('node:assert/strict')
const { createApiClient } = require('../lib/api')

test('adds bearer token for authenticated requests', async () => {
  let captured
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid/',
    getToken: () => 'synthetic-token',
    request(options) {
      captured = options
      options.success({
        statusCode: 200,
        data: { data: { id: 'usr_synthetic' } }
      })
    }
  })

  await api.getMe()

  assert.equal(captured.url, 'https://api.example.invalid/v1/me')
  assert.equal(captured.header.Authorization, 'Bearer synthetic-token')
})

test('does not send project bearer token to WeChat session endpoint', async () => {
  let captured
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request(options) {
      captured = options
      options.success({
        statusCode: 200,
        data: {
          data: {
            tokenType: 'Bearer',
            accessToken: 'new-synthetic-token',
            expiresAt: '2099-01-01T00:00:00Z',
            user: { id: 'usr_synthetic' }
          }
        }
      })
    }
  })

  await api.createWeChatSession('synthetic-wx-code')

  assert.equal(captured.header.Authorization, undefined)
})

test('maps API errors into stable Error fields', async () => {
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request(options) {
      options.success({
        statusCode: 409,
        data: {
          error: {
            code: 'SPACE_DISABLED',
            message: 'Synthetic Space is disabled',
            details: { synthetic: true }
          }
        }
      })
    }
  })

  await assert.rejects(api.switchSpace('sp_synthetic'), (error) => {
    assert.equal(error.code, 'SPACE_DISABLED')
    assert.equal(error.statusCode, 409)
    return true
  })
})


test('downloads protected avatar with bearer token', async () => {
  let captured
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request() {},
    downloadFile(options) {
      captured = options
      options.success({
        statusCode: 200,
        tempFilePath: '/tmp/synthetic-avatar.jpg'
      })
    }
  })

  const path = await api.downloadAvatar()

  assert.equal(path, '/tmp/synthetic-avatar.jpg')
  assert.equal(captured.url, 'https://api.example.invalid/v1/me/avatar')
  assert.equal(captured.header.Authorization, 'Bearer synthetic-token')
})

test('requests active resources and resource slots with Space scope', async () => {
  const calls = []
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request(options) {
      calls.push(options)
      options.success({ statusCode: 200, data: { data: [] } })
    }
  })
  await api.listResources('sp_synthetic')
  await api.listResourceSlots('sp_synthetic', 'res_synthetic', '2026-09-20', '2026-10-03')
  assert.equal(calls[0].url, 'https://api.example.invalid/v1/spaces/sp_synthetic/resources')
  assert.equal(
    calls[1].url,
    'https://api.example.invalid/v1/spaces/sp_synthetic/resources/res_synthetic/slots?from=2026-09-20&to=2026-10-03'
  )
  assert.equal(calls[1].header.Authorization, 'Bearer synthetic-token')
})


test('uses stable Booking endpoints for create, query, detail and cancel', async () => {
  const calls = []
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request(options) {
      calls.push(options)
      options.success({ statusCode: 200, data: { data: [] } })
    }
  })

  await api.createBooking('sp synthetic', {
    slotId: 'slot_synthetic',
    participantId: 'par_synthetic'
  })
  await api.listBookings('sp synthetic', {
    from: '2026-09-20',
    to: '2026-09-22',
    status: 'booked'
  })
  await api.getBooking('sp synthetic', 'bkg synthetic')
  await api.cancelBooking('sp synthetic', 'bkg synthetic')

  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, 'https://api.example.invalid/v1/spaces/sp%20synthetic/bookings')
  assert.deepEqual(calls[0].data, {
    slotId: 'slot_synthetic',
    participantId: 'par_synthetic'
  })
  assert.equal(
    calls[1].url,
    'https://api.example.invalid/v1/spaces/sp%20synthetic/bookings?from=2026-09-20&to=2026-09-22&status=booked'
  )
  assert.equal(
    calls[2].url,
    'https://api.example.invalid/v1/spaces/sp%20synthetic/bookings/bkg%20synthetic'
  )
  assert.equal(calls[3].method, 'POST')
  assert.equal(
    calls[3].url,
    'https://api.example.invalid/v1/spaces/sp%20synthetic/bookings/bkg%20synthetic/cancel'
  )
})
