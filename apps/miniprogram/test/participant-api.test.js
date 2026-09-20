const test = require('node:test')
const assert = require('node:assert/strict')
const { createApiClient } = require('../lib/api')

function clientWithCapture() {
  const requests = []
  const api = createApiClient({
    baseUrl: 'https://api.example.invalid',
    getToken: () => 'synthetic-token',
    request(options) {
      requests.push(options)
      options.success({ statusCode: 200, data: { data: [] } })
    }
  })
  return { api, requests }
}

test('participant APIs stay scoped to the explicit Space path', async () => {
  const { api, requests } = clientWithCapture()

  await api.listParticipants('sp_synthetic')
  await api.createParticipant('sp_synthetic', {
    name: 'Synthetic Person',
    birthMonth: '2012-09',
    note: null
  })
  await api.updateParticipant('sp_synthetic', 'par_synthetic', {
    name: 'Synthetic Updated',
    birthMonth: '2012-09',
    note: 'Synthetic note'
  })
  await api.deactivateParticipant('sp_synthetic', 'par_synthetic')
  await api.activateParticipant('sp_synthetic', 'par_synthetic')

  assert.deepEqual(requests.map((request) => [request.method, request.url]), [
    ['GET', 'https://api.example.invalid/v1/spaces/sp_synthetic/participants'],
    ['POST', 'https://api.example.invalid/v1/spaces/sp_synthetic/participants'],
    ['PATCH', 'https://api.example.invalid/v1/spaces/sp_synthetic/participants/par_synthetic'],
    ['POST', 'https://api.example.invalid/v1/spaces/sp_synthetic/participants/par_synthetic/deactivate'],
    ['POST', 'https://api.example.invalid/v1/spaces/sp_synthetic/participants/par_synthetic/activate']
  ])
})
