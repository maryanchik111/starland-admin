import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, asService, createAuthUser } from './rls-harness.js'

const createdYearIds: string[] = []
const createdAuthUserIds: string[] = []

async function trackYear(name: string, startsOn: Date, endsOn: Date) {
  const year = await prisma.academicYear.create({
    data: { name, startsOn, endsOn },
  })
  createdYearIds.push(year.id)
  return year
}

async function trackedAuthUser(email: string): Promise<string> {
  const authUserId = await createAuthUser(email)
  createdAuthUserIds.push(authUserId)
  return authUserId
}

afterEach(async () => {
  while (createdYearIds.length > 0) {
    const yearId = createdYearIds.pop()
    if (!yearId) continue
    await prisma.academicCalendarDay.deleteMany({ where: { academicYearId: yearId } })
    await prisma.class.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicYear.delete({ where: { id: yearId } })
  }

  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
})

describe('school structure', () => {
  it('rejects two classes with the same name in one academic year', async () => {
    const year = await trackYear(`2026/2027-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))
    await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } })

    await expect(
      prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } }),
    ).rejects.toThrow()
  })

  it('marks calendar days as non-teaching', async () => {
    const year = await trackYear(`2027/2028-${randomUUID()}`, new Date('2027-09-01'), new Date('2028-06-30'))
    const day = await prisma.academicCalendarDay.create({
      data: { academicYearId: year.id, date: new Date('2027-10-26'), kind: 'holiday', title: 'Осінні канікули' },
    })

    expect(day.isTeachingDay).toBe(false)
  })
})

describe('RLS: reference tables', () => {
  it('hides academic_years from users without auth session', async () => {
    const year = await trackYear(`rls-ref-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))

    const rowsWithoutSession = await asService(async (tx) => {
      await tx.$executeRawUnsafe("set local role authenticated")
      await tx.$executeRawUnsafe("set local request.jwt.claims = '{}'")
      return tx.$queryRaw<{ id: string }[]>`select id from academic_years where id = ${year.id}::uuid`
    })

    expect(rowsWithoutSession).toHaveLength(0)

    const authId = await trackedAuthUser(`rls-ref-${randomUUID()}@starland.test`)
    const rowsWithSession = await asUser(authId, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from academic_years where id = ${year.id}::uuid`
    })

    expect(rowsWithSession).toHaveLength(1)
  })
})

describe('RLS: classes', () => {
  it('hides classes from users without scopes', async () => {
    const year = await trackYear(`rls-classes-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))
    const cls = await prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 5, name: `5-А-${randomUUID()}` },
    })

    const noScopeUser = await trackedAuthUser(`rls-nosc-${randomUUID()}@starland.test`)
    const visibleClasses = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from classes where id = ${cls.id}::uuid`
    })

    expect(visibleClasses).toHaveLength(0)
  })

  it('shows classes to users with global classes.read scope', async () => {
    const year = await trackYear(`rls-global-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))
    const cls = await prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 5, name: `5-Б-${randomUUID()}` },
    })

    const globalUser = await trackedAuthUser(`rls-global-${randomUUID()}@starland.test`)
    const globalAppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: globalUser } })

    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${globalAppUser.id}::uuid, 'classes.read', 'global'::scope_type, null, now(), now())
    `

    const visibleClasses = await asUser(globalUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from classes where id = ${cls.id}::uuid`
    })

    expect(visibleClasses).toHaveLength(1)
  })

  it('shows classes only to users with scoped classes.read permission for that class', async () => {
    const year = await trackYear(`rls-scoped-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))
    const cls1 = await prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 6, name: `6-А-${randomUUID()}` },
    })
    const cls2 = await prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 6, name: `6-Б-${randomUUID()}` },
    })

    const scopedUser = await trackedAuthUser(`rls-scoped-${randomUUID()}@starland.test`)
    const scopedAppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: scopedUser } })

    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${scopedAppUser.id}::uuid, 'classes.read', 'class'::scope_type, ${cls1.id}::uuid, now(), now())
    `

    const visibleClasses = await asUser(scopedUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from classes order by id`
    })

    expect(visibleClasses).toHaveLength(1)
    expect(visibleClasses[0]?.id).toBe(cls1.id)
  })
})
