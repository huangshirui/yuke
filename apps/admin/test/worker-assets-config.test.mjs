import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const path = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const config = readFileSync(path, 'utf8')

test('Admin production deploy uses Static Assets plus an internal API Service Binding', () => {
  for (const expected of [
    'name = "yuke-admin"',
    'main = "./worker/index.js"',
    'workers_dev = false',
    'preview_urls = false',
    'directory = "./dist"',
    'not_found_handling = "single-page-application"',
    'run_worker_first = ["/api/*"]',
    'binding = "API"',
    'service = "yuke-api"',
    'pattern = "yuke.verinasci.com"',
    'custom_domain = true'
  ]) {
    assert.equal(config.includes(expected), true, expected)
  }
})
