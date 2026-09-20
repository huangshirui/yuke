import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../worker/index.js'

test('Admin gateway rewrites /api and forwards Access JWT through Service Binding', async () => {
  let forwarded = null
  const env = {
    API: {
      async fetch(request) {
        forwarded = request
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    }
  }

  const response = await worker.fetch(
    new Request('https://yuke.example.invalid/api/v1/admin/spaces?synthetic=1', {
      headers: {
        'cf-access-jwt-assertion': 'synthetic-access-jwt',
        cookie: 'CF_Authorization=synthetic-cookie'
      }
    }),
    env
  )

  assert.equal(response.status, 200)
  assert.ok(forwarded)
  const url = new URL(forwarded.url)
  assert.equal(url.pathname, '/v1/admin/spaces')
  assert.equal(url.search, '?synthetic=1')
  assert.equal(
    forwarded.headers.get('cf-access-jwt-assertion'),
    'synthetic-access-jwt'
  )
  assert.equal(forwarded.headers.get('cookie'), null)
})

test('Admin gateway rejects requests without an Access JWT before binding call', async () => {
  let called = false
  const response = await worker.fetch(
    new Request('https://yuke.example.invalid/api/v1/admin/spaces'),
    {
      API: {
        async fetch() {
          called = true
          return new Response(null, { status: 200 })
        }
      }
    }
  )

  assert.equal(response.status, 401)
  assert.equal(called, false)
})

test('Admin gateway does not expose non-Admin yuke-api routes', async () => {
  let called = false
  const response = await worker.fetch(
    new Request('https://yuke.example.invalid/api/v1/health', {
      headers: { 'cf-access-jwt-assertion': 'synthetic-access-jwt' }
    }),
    {
      API: {
        async fetch() {
          called = true
          return new Response(null, { status: 200 })
        }
      }
    }
  )

  assert.equal(response.status, 404)
  assert.equal(called, false)
})
