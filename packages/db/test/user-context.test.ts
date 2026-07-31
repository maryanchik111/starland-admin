import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { appPrisma, withUserContext } from '../src/user-context.js'

/**
 * Minimal local helper for this task only: inserts a matching `auth.users`
 * row (Supabase's identity table, not a Prisma model) and an `app_users`
 * row, using the privileged migration client. Task 3 owns the shared
 * `createAuthUser` in `rls-harness.ts` — this is intentionally not that,
 * and is small enough to duplicate rather than half-build that file here.
 */
async function createAuthUser(email: string): Promise<string> {
  const id = randomUUID()
  await prisma.$executeRaw`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${email})
  `
  await prisma.appUser.create({
    data: {
      authUserId: id,
      fullName: email,
      email,
    },
  })
  return id
}

/**
 * Runs a query as `authenticated` with no identity claim set — i.e. the
 * role switch that `withUserContext` always performs, but no `sub`.
 *
 * This is deliberately NOT the same as an entirely bare connection: `app_runtime`
 * is created `noinherit`, so its base connection has no table privileges at
 * all until it assumes `authenticated` — a bare `appPrisma.$queryRaw` with
 * no role switch fails with "permission denied", not an empty result (see
 * the dedicated test below for that path). Here the role switch happens
 * but `request.jwt.claims` is never set, so `auth.uid()` evaluates to null,
 * `auth_user_id = auth.uid()` is false for every row, and RLS returns zero
 * rows without any grant error — the behaviour this test asserts.
 */
async function appPrismaRaw(): Promise<Array<{ email: string }>> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('set local role authenticated')
    return tx.$queryRaw<Array<{ email: string }>>`select email from app_users`
  })
}

describe('withUserContext', () => {
  it('shows the caller only their own app_users row', async () => {
    const alice = await createAuthUser(`ctx-alice-${Date.now()}@starland.test`)
    await createAuthUser(`ctx-bob-${Date.now()}@starland.test`)

    const rows = await withUserContext(alice, (tx) =>
      tx.$queryRaw<Array<{ email: string }>>`select email from app_users`,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.email).toContain('ctx-alice')
  })

  it('returns nothing when the authenticated role is assumed but no identity is set', async () => {
    await createAuthUser(`ctx-nobody-${Date.now()}@starland.test`)

    const rows = await appPrismaRaw()
    expect(rows).toHaveLength(0)
  })

  it('rejects with permission denied on a bare connection that never assumed a role', async () => {
    await expect(
      appPrisma.$queryRaw<Array<{ email: string }>>`select email from app_users`,
    ).rejects.toThrow(/permission denied/i)
  })

  it('does not leak the context into the next transaction', async () => {
    const carol = await createAuthUser(`ctx-carol-${Date.now()}@starland.test`)
    await withUserContext(carol, (tx) => tx.$queryRaw`select 1`)

    const rows = await appPrismaRaw()
    expect(rows).toHaveLength(0)
  })

  it('still sees every row through the privileged migration client', async () => {
    await createAuthUser(`ctx-admin-${Date.now()}@starland.test`)
    const all = await prisma.appUser.findMany()
    expect(all.length).toBeGreaterThan(0)
  })
})
