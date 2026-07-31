import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asService, asUser, createAuthUser } from './rls-harness.js'

// Every row this file creates is tracked here and removed in `afterEach`, so
// the suite leaves no trace in `app_users` / `auth.users` regardless of pass
// or fail (unlike the deliberately-not-cleaned-up rows in
// `user-context.test.ts`, whose emails carry a `ctx-` prefix so they never
// collide with the ones created here).
const createdAuthUserIds: string[] = []

async function trackedAuthUser(email: string): Promise<string> {
  const authUserId = await createAuthUser(email)
  createdAuthUserIds.push(authUserId)
  return authUserId
}

afterEach(async () => {
  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
})

describe('rls harness', () => {
  it('shows a user only their own app_users row', async () => {
    const aliceEmail = `alice-${randomUUID()}@starland.test`
    const bobEmail = `bob-${randomUUID()}@starland.test`
    const alice = await trackedAuthUser(aliceEmail)
    const bob = await trackedAuthUser(bobEmail)

    const rows = await asUser(alice, (tx) =>
      tx.$queryRaw<Array<{ email: string }>>`select email from app_users`,
    )

    expect(rows.map((r) => r.email)).toEqual([aliceEmail])
    expect(rows.map((r) => r.email)).not.toContain(bobEmail)
    expect(bob).toBeTruthy()
  })

  it('sees every row when running as service role', async () => {
    const carolEmail = `carol-${randomUUID()}@starland.test`
    await trackedAuthUser(carolEmail)

    const rows = await asService((tx) =>
      tx.$queryRaw<Array<{ n: bigint }>>`select count(*) as n from app_users`,
    )

    expect(Number(rows[0]?.n ?? 0)).toBeGreaterThan(0)
  })
})
