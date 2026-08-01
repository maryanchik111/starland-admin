import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { getSetting } from '../src/settings.js'
import { asUser, createAuthUser } from './rls-harness.js'

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

describe('app settings', () => {
  it('returns the seeded no-show delay', async () => {
    expect(await getSetting('attendance.no_show_delay_minutes')).toBe(15)
  })

  it('returns the seeded retention period', async () => {
    expect(await getSetting('retention.graduate_years')).toBe(5)
  })

  it('throws for an unknown key instead of returning undefined', async () => {
    // @ts-expect-error перевіряємо поведінку в рантаймі на невідомому ключі
    await expect(getSetting('nope.not.a.key')).rejects.toThrow(/unknown setting/i)
  })

  it('allows authenticated user to read app_settings via RLS', async () => {
    const userEmail = `rls-test-${randomUUID()}@starland.test`
    const authUserId = await trackedAuthUser(userEmail)

    const rows = await asUser(authUserId, (tx) =>
      tx.$queryRaw<Array<{ key: string }>>`select key from app_settings order by key`,
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.key)).toContain('attendance.no_show_delay_minutes')
    expect(rows.map((r) => r.key)).toContain('retention.graduate_years')
  })
})
