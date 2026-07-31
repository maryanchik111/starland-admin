import { prisma } from '../src/index.js'

/**
 * Runs once before the whole `packages/db` test run (see `vitest.config.ts`
 * `globalSetup`). Sweeps any `%@starland.test` rows left behind by a
 * previous crashed/interrupted run — this is a backstop, not the primary
 * cleanup mechanism: well-behaved test files (see `rls-harness.test.ts`)
 * still track and delete their own rows in `afterEach`. Uses the privileged
 * `prisma` client, consistent with the rest of this harness — no raw `pg`.
 */
export default async function setup(): Promise<void> {
  await prisma.appUser.deleteMany({
    where: { email: { endsWith: '@starland.test' } },
  })
  await prisma.$executeRaw`delete from auth.users where email like '%@starland.test'`
}
