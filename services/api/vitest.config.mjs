import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url))

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: './wrangler.toml'
      },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
          WECHAT_APP_ID: 'synthetic-app-id',
          WECHAT_APP_SECRET: 'synthetic-app-secret-not-a-credential',
          USER_TOKEN_SECRET: 'synthetic-token-signing-secret-for-tests-only-0001'
        }
      }
    }))
  ],
  test: {
    include: ['test/**/*.test.mjs'],
    setupFiles: ['./test/apply-migrations.mjs']
  }
})
