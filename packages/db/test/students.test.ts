import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, asService, createAuthUser } from './rls-harness.js'

const createdAuthUserIds: string[] = []
const createdYearIds: string[] = []

async function makeClass(name: string) {
  const year = await prisma.academicYear.create({
    data: { name: `Y-${name}-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  createdYearIds.push(year.id)
  return prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name } })
}

async function trackedAuthUser(email: string): Promise<string> {
  const authUserId = await createAuthUser(email)
  createdAuthUserIds.push(authUserId)
  return authUserId
}

afterEach(async () => {
  // Delete students (including their enrollments and cards via cascades)
  await prisma.personCard.deleteMany({})
  await prisma.linkedAccount.deleteMany({})
  await prisma.studentMeasurement.deleteMany({})
  await prisma.guardianship.deleteMany({})
  await prisma.enrollment.deleteMany({})
  await prisma.student.deleteMany({})

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

describe('students', () => {
  it('keeps enrollment history when a student changes class', async () => {
    const from = await makeClass('5-А')
    const to = await makeClass('5-Б')
    const student = await prisma.student.create({
      data: { firstName: 'Іван', lastName: 'Петренко', bornOn: new Date('2015-04-12') },
    })

    await prisma.enrollment.create({
      data: { studentId: student.id, classId: from.id, fromDate: new Date('2026-09-01'), toDate: new Date('2026-12-20') },
    })
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: to.id, fromDate: new Date('2027-01-10') },
    })

    const history = await prisma.enrollment.findMany({ where: { studentId: student.id } })
    expect(history).toHaveLength(2)
  })

  it('refuses to bind one qr code to two people at the same time', async () => {
    const a = await prisma.student.create({
      data: { firstName: 'Олена', lastName: 'Коваль', bornOn: new Date('2015-01-01') },
    })
    const b = await prisma.student.create({
      data: { firstName: 'Марія', lastName: 'Коваль', bornOn: new Date('2016-01-01') },
    })

    await prisma.personCard.create({
      data: { studentId: a.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
    })

    await expect(async () => {
      await prisma.personCard.create({
        data: { studentId: b.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
      })
    }).rejects.toThrow()
  })
})

describe('RLS: students', () => {
  it('hides students from users without scopes', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Арсен', lastName: 'Коваль', bornOn: new Date('2015-06-01') },
    })

    const noScopeUser = await trackedAuthUser(`rls-nosc-student-${randomUUID()}@starland.test`)
    const visibleStudents = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from students where id = ${student.id}::uuid`
    })

    expect(visibleStudents).toHaveLength(0)
  })

  it('shows students to users with global students.read scope', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Богдан', lastName: 'Петренко', bornOn: new Date('2015-07-01') },
    })

    const globalUser = await trackedAuthUser(`rls-global-student-${randomUUID()}@starland.test`)
    const globalAppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: globalUser } })

    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${globalAppUser.id}::uuid, 'students.read', 'global'::scope_type, null, now(), now())
    `

    const visibleStudents = await asUser(globalUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from students where id = ${student.id}::uuid`
    })

    expect(visibleStudents).toHaveLength(1)
  })

  it('shows students only to users with scoped students.read permission for that student', async () => {
    const student1 = await prisma.student.create({
      data: { firstName: 'Володимир', lastName: 'Сергієнко', bornOn: new Date('2015-08-01') },
    })
    const student2 = await prisma.student.create({
      data: { firstName: 'Галина', lastName: 'Морозова', bornOn: new Date('2015-09-01') },
    })

    const scopedUser = await trackedAuthUser(`rls-scoped-student-${randomUUID()}@starland.test`)
    const scopedAppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: scopedUser } })

    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${scopedAppUser.id}::uuid, 'students.read', 'student'::scope_type, ${student1.id}::uuid, now(), now())
    `

    const visibleStudents = await asUser(scopedUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from students order by id`
    })

    expect(visibleStudents).toHaveLength(1)
    expect(visibleStudents[0]?.id).toBe(student1.id)
  })

  it('shows students to users with class scope for currently enrolled students only', async () => {
    const year = await prisma.academicYear.create({
      data: { name: `Y-enrollment-${randomUUID()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    createdYearIds.push(year.id)

    const cls = await prisma.class.create({
      data: { academicYearId: year.id, gradeLevel: 5, name: `5-Г-${randomUUID()}` },
    })

    const currentStudent = await prisma.student.create({
      data: { firstName: 'Д', lastName: 'Поточний', bornOn: new Date('2015-10-01') },
    })

    const pastStudent = await prisma.student.create({
      data: { firstName: 'П', lastName: 'Минулий', bornOn: new Date('2015-11-01') },
    })

    // Current student: active enrollment (to_date is null)
    await prisma.enrollment.create({
      data: { studentId: currentStudent.id, classId: cls.id, fromDate: new Date('2026-09-01') },
    })

    // Past student: ended enrollment (to_date in past)
    await prisma.enrollment.create({
      data: { studentId: pastStudent.id, classId: cls.id, fromDate: new Date('2025-09-01'), toDate: new Date('2026-06-30') },
    })

    const classUser = await trackedAuthUser(`rls-class-enroll-${randomUUID()}@starland.test`)
    const classAppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: classUser } })

    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${classAppUser.id}::uuid, 'students.read', 'class'::scope_type, ${cls.id}::uuid, now(), now())
    `

    const visibleStudents = await asUser(classUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from students order by id`
    })

    expect(visibleStudents).toHaveLength(1)
    expect(visibleStudents[0]?.id).toBe(currentStudent.id)
  })
})

describe('RLS: linked_accounts', () => {
  it('shows users only their own linked_accounts row', async () => {
    const user1 = await trackedAuthUser(`rls-la-user1-${randomUUID()}@starland.test`)
    const user2 = await trackedAuthUser(`rls-la-user2-${randomUUID()}@starland.test`)

    const user1AppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: user1 } })
    const user2AppUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: user2 } })

    const student1 = await prisma.student.create({
      data: { firstName: 'Є', lastName: 'Студент1', bornOn: new Date('2015-12-01') },
    })

    const student2 = await prisma.student.create({
      data: { firstName: 'Ж', lastName: 'Студент2', bornOn: new Date('2016-01-01') },
    })

    // Create linked accounts
    await prisma.linkedAccount.create({
      data: { ownerUserId: user1AppUser.id, studentId: student1.id, linkedBy: user1AppUser.id },
    })

    await prisma.linkedAccount.create({
      data: { ownerUserId: user2AppUser.id, studentId: student2.id, linkedBy: user2AppUser.id },
    })

    // User1 should see only their own linked account
    const user1Accounts = await asUser(user1, async (tx) => {
      return tx.$queryRaw<{ ownerUserId: string }[]>`select owner_user_id as "ownerUserId" from linked_accounts`
    })

    expect(user1Accounts).toHaveLength(1)
    expect(user1Accounts[0]?.ownerUserId).toBe(user1AppUser.id)

    // User2 should see only their own linked account
    const user2Accounts = await asUser(user2, async (tx) => {
      return tx.$queryRaw<{ ownerUserId: string }[]>`select owner_user_id as "ownerUserId" from linked_accounts`
    })

    expect(user2Accounts).toHaveLength(1)
    expect(user2Accounts[0]?.ownerUserId).toBe(user2AppUser.id)
  })
})
