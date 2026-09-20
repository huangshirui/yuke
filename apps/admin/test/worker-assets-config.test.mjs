import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const path = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const config = readFileSync(path, 'utf8')

test('Admin production deploy uses a dedicated Worker Static Assets app', () => {
  for (const expected of [
    'name = "yuke-admin"',
    'workers_dev = false',
    'preview_urls = false',
    'directory = "./dist"',
    'not_found_handling = "single-page-application"',
    'pattern = "yuke.verinasci.com"',
    'custom_domain = true'
  ]) {
    assert.equal(config.includes(expected), true, expected)
  }

  assert.equal(/^main\s*=/m.test(config), false)
})
