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

// Pin the runtime-role client to a single physical connection for this test
// run only (process.env, not .env itself — production/dev keep a normal
// pool size). The leak test in test/user-context.test.ts is only meaningful
// if `withUserContext(...)` and the following bare query are forced onto
// the same connection: with a bigger pool, a passing test could just mean
// the two calls never shared a connection, proving nothing about leakage.
if (process.env.APP_DATABASE_URL) {
  const url = new URL(process.env.APP_DATABASE_URL)
  url.searchParams.set('connection_limit', '1')
  process.env.APP_DATABASE_URL = url.toString()
}

export default defineConfig({
  test: {
    environment: 'node',
    // Sweeps leftover `%@starland.test` rows from a previous
    // crashed/interrupted run before this run's tests start. See
    // test/global-setup.ts.
    globalSetup: ['./test/global-setup.ts'],
    // All test files share one live local Supabase database. Running files
    // in parallel workers would let their transactions interleave against
    // the same tables (and, combined with the connection_limit=1 pin above,
    // contend for a single physical connection), producing floating
    // failures instead of deterministic ones.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
