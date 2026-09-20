import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(
  new URL('../scripts/verify-production-env.mjs', import.meta.url)
)

test('accepts the real production Admin API shape', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_ADMIN_DATA_MODE: 'api',
      VITE_API_BASE_URL: 'https://api.example.invalid'
    }
  })
  assert.equal(result.status, 0, result.stderr)
})

test('rejects production mock mode', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_ADMIN_DATA_MODE: 'mock',
      VITE_API_BASE_URL: 'https://api.example.invalid'
    }
  })
  assert.notEqual(result.status, 0)
})

test('rejects non-HTTPS or path-bearing API URLs', () => {
  for (const value of [
    'http://api.example.invalid',
    'https://api.example.invalid/v1'
  ]) {
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VITE_ADMIN_DATA_MODE: 'api',
        VITE_API_BASE_URL: value
      }
    })
    assert.notEqual(result.status, 0, value)
  }
})
