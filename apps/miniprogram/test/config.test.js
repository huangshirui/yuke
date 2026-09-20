const test = require('node:test')
const assert = require('node:assert/strict')
const config = require('../config')

test('online Mini Program runtime uses the production HTTPS Worker origin', () => {
  assert.equal(config.apiMode, 'remote')
  assert.equal(config.apiBaseUrl, 'https://api.yuke.verinasci.com')

  const url = new URL(config.apiBaseUrl)
  assert.equal(url.protocol, 'https:')
  assert.equal(url.origin, config.apiBaseUrl)
  assert.equal(url.pathname, '/')
})
