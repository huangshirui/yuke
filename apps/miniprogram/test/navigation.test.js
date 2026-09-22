const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { routeToEntry } = require('../lib/navigation')

function createWxApi() {
  const calls = []
  const storage = new Map()
  return {
    calls,
    storage,
    setStorageSync(key, value) {
      storage.set(key, value)
    },
    switchTab(options) {
      calls.push(['switchTab', options.url])
    },
    reLaunch(options) {
      calls.push(['reLaunch', options.url])
    }
  }
}

test('primary tab bar only exposes booking and profile', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8'))

  assert.deepEqual(
    appConfig.tabBar.list.map((item) => [item.pagePath, item.text]),
    [
      ['pages/schedule/index', '预约'],
      ['pages/me/index', '我的']
    ]
  )
  assert.ok(appConfig.pages.includes('pages/overview/index'))
})

test('entry automatically selects one active service provider', async () => {
  const wxApi = createWxApi()
  const selected = []
  const initialUser = {
    profileInitialized: true,
    currentSpaceId: null,
    spaces: [{ id: 'sp_only', status: 'active' }]
  }
  const selectedUser = { ...initialUser, currentSpaceId: 'sp_only' }

  const entry = await routeToEntry(wxApi, initialUser, {
    api: {
      async switchSpace(spaceId) {
        selected.push(spaceId)
      },
      async getMe() {
        return selectedUser
      }
    },
    storage: wxApi
  })

  assert.deepEqual(selected, ['sp_only'])
  assert.equal(entry.reason, 'ready')
  assert.deepEqual(wxApi.calls, [['switchTab', '/pages/schedule/index']])
})

test('entry opens service provider selection when multiple are active', async () => {
  const wxApi = createWxApi()

  const entry = await routeToEntry(wxApi, {
    profileInitialized: true,
    currentSpaceId: null,
    spaces: [
      { id: 'sp_a', status: 'active' },
      { id: 'sp_b', status: 'active' }
    ]
  })

  assert.equal(entry.reason, 'space-selection-required')
  assert.deepEqual(wxApi.calls, [['reLaunch', '/pages/spaces/index?required=1']])
})
