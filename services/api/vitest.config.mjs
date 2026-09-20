import { fileURLToPath } from 'node:url'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { readD1Migrations } from '@cloudflare/vitest-plugin/config'
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
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath)
        }
      }
    }))
  ],
  test: {
    include: ['test/**/*.test.mjs'],
    setupFiles: ['./test/apply-migrations.mjs']
  }
})
