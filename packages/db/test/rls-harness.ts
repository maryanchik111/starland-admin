import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../src/index.js'
import { withUserContext } from '../src/user-context.js'

/**
 * Transaction client shape shared by `prisma.$transaction` and
 * `appPrisma.$transaction` (via `withUserContext`) — both are generated from
 * the same Prisma client, so the callback signature is structurally
 * identical regardless of which underlying connection/role is behind it.
 */
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Runs queries on behalf of an authenticated user through the exact
 * `withUserContext` machinery production code uses (`src/user-context.ts`):
 * same `app_runtime` connection, same `set_config('request.jwt.claims', …)`,
 * same `set local role authenticated`. There is no second "act as user"
 * code path here — a test built on `asUser` exercises the identical
 * mechanism a real request goes through, so it proves something about
 * production RLS behaviour, not just about a test-only stand-in.
 */
export async function asUser<T>(
  authUserId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withUserContext(authUserId, fn)
}

/**
 * Thrown internally by `asService` to force `prisma.$transaction` to roll
 * back while still carrying the callback's result out to the caller. Never
 * escapes `asService`.
 */
class RollbackSentinel<T> extends Error {
  constructor(public readonly result: T) {
    super('rls-harness: rollback sentinel, not a real error')
  }
}

/**
 * Runs queries with the privileged `prisma` client — the same client
 * privileged/service-role code paths use, connecting as the `postgres`
 * superuser and bypassing RLS. Wrapped in a transaction that always rolls
 * back, so any writes performed inside `fn` never leak into the next test.
 */
export async function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new RollbackSentinel(await fn(tx))
    })
  } catch (err) {
    if (err instanceof RollbackSentinel) return err.result as T
    throw err
  }
  /* c8 ignore next -- $transaction above always throws RollbackSentinel or rethrows */
  throw new Error('unreachable: asService transaction did not roll back')
}

/**
 * Creates a Supabase `auth.users` row plus its linked `app_users` row, using
 * the privileged `prisma` client, committed immediately (not inside a
 * rolled-back transaction): `asUser` opens its own separate transaction on a
 * different connection and needs the row to already be visible there.
 *
 * Callers are responsible for deleting the returned id's rows afterwards
 * (see `rls-harness.test.ts` for the tracked-cleanup pattern) — this
 * function intentionally does not clean up after itself, matching
 * `createAuthUser`'s job of producing durable fixture data.
 */
export async function createAuthUser(email: string): Promise<string> {
  const authUserId = randomUUID()
  await prisma.$executeRaw`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${email}, '', now(), now(), now())
  `
  await prisma.appUser.create({
    data: {
      authUserId,
      fullName: email.split('@')[0] ?? email,
      email,
    },
  })
  return authUserId
}
