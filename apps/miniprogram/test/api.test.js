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
