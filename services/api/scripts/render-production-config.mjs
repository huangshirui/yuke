import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const defaultOutput = resolve(packageRoot, '.wrangler/production.toml')

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function assertDatabaseId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('YUKE_D1_DATABASE_ID must be a UUID')
  }
}

function assertBucketName(value) {
  if (
    value.length < 3 ||
    value.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  ) {
    throw new Error(
      'YUKE_R2_BUCKET_NAME must be 3-63 lowercase letters, numbers, or hyphens'
    )
  }
}

function assertHostname(value) {
  if (
    value.length > 253 ||
    value.includes('/') ||
    value.includes(':') ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value)
  ) {
    throw new Error('YUKE_API_CUSTOM_DOMAIN must be a hostname without scheme or path')
  }
}

function tomlString(value) {
  return JSON.stringify(value)
}

const databaseName = required('YUKE_D1_DATABASE_NAME')
const databaseId = required('YUKE_D1_DATABASE_ID')
const bucketName = required('YUKE_R2_BUCKET_NAME')
const customDomain =
  process.env.YUKE_API_CUSTOM_DOMAIN?.trim() || 'api.yuke.verinasci.com'

assertDatabaseId(databaseId)
assertBucketName(bucketName)
assertHostname(customDomain)

const outputPath = process.env.YUKE_PRODUCTION_CONFIG_PATH
  ? resolve(process.env.YUKE_PRODUCTION_CONFIG_PATH)
  : defaultOutput

const content = `# GENERATED FILE — DO NOT COMMIT.
# Real Cloudflare resource identifiers are intentionally kept outside Git.

name = "yuke-api"
main = "../src/index.ts"
compatibility_date = "2026-09-20"
workers_dev = false
preview_urls = false

[[routes]]
pattern = ${tomlString(customDomain)}
custom_domain = true

[[d1_databases]]
binding = "DB"
database_name = ${tomlString(databaseName)}
database_id = ${tomlString(databaseId)}
migrations_dir = "../migrations"
migrations_table = "d1_migrations"

[[r2_buckets]]
binding = "AVATARS"
bucket_name = ${tomlString(bucketName)}
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, content, { encoding: 'utf8', mode: 0o600 })

console.log(`Generated controlled Wrangler config: ${outputPath}`)
