import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(
  new URL('../scripts/verify-production-env.mjs', import.meta.url)
)

test('accepts production API mode without an API base environment variable', () => {
  const env = { ...process.env, VITE_ADMIN_DATA_MODE: 'api' }
  delete env.VITE_API_BASE_URL

  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\/api -> yuke-admin -> Service Binding -> yuke-api/)
})

test('ignores shell-specific VITE_API_BASE_URL values because production base is code-fixed', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_ADMIN_DATA_MODE: 'api',
      VITE_API_BASE_URL: 'C:/Program Files/Git/api'
    }
  })

  assert.equal(result.status, 0, result.stderr)
})

test('rejects production mock mode', () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_ADMIN_DATA_MODE: 'mock'
    }
  })

  assert.notEqual(result.status, 0)
})
