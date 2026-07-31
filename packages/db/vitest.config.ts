import { defineConfig } from 'vitest/config'

// Tests run against the live local Supabase Postgres and need DATABASE_URL /
// APP_DATABASE_URL from `.env` before `src/index.ts` or `src/user-context.ts`
// construct their PrismaClient instances. `process.loadEnvFile` is a Node
// builtin (no dotenv dependency needed) and this config file runs before any
// test file is imported.
try {
  process.loadEnvFile('.env')
} catch {
  // .env is gitignored and optional: CI/production supply real env vars directly.
}

export default defineConfig({
  test: {
    environment: 'node',
  },
})
