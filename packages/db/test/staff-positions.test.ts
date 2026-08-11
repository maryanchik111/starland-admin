import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asService, asUser, createAuthUser } from './rls-harness.js'

describe('staff_positions catalog', () => {
  it('is seeded with the core school positions', async () => {
    const codes = await prisma.staffPosition.findMany({ select: { code: true } })
    expect(codes.map((c) => c.code)).toEqual(
      expect.arrayContaining(['teacher', 'security_guard', 'cleaner', 'cook', 'accountant']),
    )
  })

  it('flags non-teaching positions', async () => {
    const cleaner = await prisma.staffPosition.findUniqueOrThrow({ where: { code: 'cleaner' } })
    const teacher = await prisma.staffPosition.findUniqueOrThrow({ where: { code: 'teacher' } })
    expect(cleaner.isTeaching).toBe(false)
    expect(teacher.isTeaching).toBe(true)
  })
})

describe('RLS: staff_positions_read', () => {
  it('hides the catalog from sessions without auth', async () => {
    const rowsWithoutSession = await asService(async (tx) => {
      await tx.$executeRawUnsafe('set local role authenticated')
      await tx.$executeRawUnsafe("set local request.jwt.claims = '{}'")
      return tx.$queryRaw<{ code: string }[]>`select code from staff_positions where code = 'teacher'`
    })
    expect(rowsWithoutSession).toHaveLength(0)
  })

  it('shows the catalog to any authenticated session', async () => {
    const authId = await createAuthUser(`staffpos-${randomUUID()}@starland.test`)
    const rowsWithSession = await asUser(authId, async (tx) => {
      return tx.$queryRaw<{ code: string }[]>`select code from staff_positions where code = 'teacher'`
    })
    expect(rowsWithSession).toHaveLength(1)

    await prisma.appUser.deleteMany({ where: { authUserId: authId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authId}::uuid`
  })
})
