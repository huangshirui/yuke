import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tempDir = mkdtempSync(join(tmpdir(), 'yuke-production-config-'))
const output = join(tempDir, 'production.toml')
const script = fileURLToPath(new URL('./render-production-config.mjs', import.meta.url))

try {
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      YUKE_D1_DATABASE_NAME: 'synthetic-yuke-db',
      YUKE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
      YUKE_R2_BUCKET_NAME: 'synthetic-yuke-avatars',
      YUKE_API_CUSTOM_DOMAIN: 'api.example.invalid',
      YUKE_ADMIN_ORIGIN: 'https://admin.example.invalid',
      YUKE_PRODUCTION_CONFIG_PATH: output
    }
  })

  if (result.status !== 0) {
    throw new Error(
      ['Production config renderer failed', result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
    )
  }

  const rendered = readFileSync(output, 'utf8')
  for (const expected of [
    'name = "yuke-api"',
    'main = "../src/index.ts"',
    'ADMIN_ORIGIN = "https://admin.example.invalid"',
    'pattern = "api.example.invalid"',
    'database_name = "synthetic-yuke-db"',
    'database_id = "11111111-1111-4111-8111-111111111111"',
    'migrations_dir = "../migrations"',
    'bucket_name = "synthetic-yuke-avatars"',
    'workers_dev = false'
  ]) {
    if (!rendered.includes(expected)) {
      throw new Error(`Generated config is missing: ${expected}`)
    }
  }

  if (/WECHAT_APP_SECRET|CF_ACCESS_AUD|SUPER_ADMIN_EMAIL/.test(rendered)) {
    throw new Error('Generated production config must not contain runtime secret values')
  }

  console.log('Production Wrangler config verification passed.')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
