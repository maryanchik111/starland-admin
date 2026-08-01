import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, asService, createAuthUser } from './rls-harness.js'

const createdAuthUserIds: string[] = []
const createdYearIds: string[] = []
const createdStudentIds: string[] = []
const createdPersonCardIds: string[] = []
const createdLinkedAccountIds: string[] = []
const createdStudentMeasurementIds: string[] = []
const createdGuardianshipIds: string[] = []
const createdEnrollmentIds: string[] = []

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

async function trackedStudent(firstName: string, lastName: string, bornOn: Date) {
  const student = await prisma.student.create({
    data: { firstName, lastName, bornOn },
  })
  createdStudentIds.push(student.id)
  return student
}

afterEach(async () => {
  // Delete only tracked records in correct dependency order
  while (createdPersonCardIds.length > 0) {
    const id = createdPersonCardIds.pop()
    if (id) await prisma.personCard.deleteMany({ where: { id } })
  }

  while (createdLinkedAccountIds.length > 0) {
    const id = createdLinkedAccountIds.pop()
    if (id) await prisma.linkedAccount.deleteMany({ where: { id } })
  }

  while (createdStudentMeasurementIds.length > 0) {
    const id = createdStudentMeasurementIds.pop()
    if (id) await prisma.studentMeasurement.deleteMany({ where: { id } })
  }

  while (createdGuardianshipIds.length > 0) {
    const id = createdGuardianshipIds.pop()
    if (id) await prisma.guardianship.deleteMany({ where: { id } })
  }

  while (createdEnrollmentIds.length > 0) {
    const id = createdEnrollmentIds.pop()
    if (id) await prisma.enrollment.deleteMany({ where: { id } })
  }

  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (id) await prisma.student.deleteMany({ where: { id } })
  }

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
    const student = await trackedStudent('Іван', 'Петренко', new Date('2015-04-12'))

    const enr1 = await prisma.enrollment.create({
      data: { studentId: student.id, classId: from.id, fromDate: new Date('2026-09-01'), toDate: new Date('2026-12-20') },
    })
    createdEnrollmentIds.push(enr1.id)

    const enr2 = await prisma.enrollment.create({
      data: { studentId: student.id, classId: to.id, fromDate: new Date('2027-01-10') },
    })
    createdEnrollmentIds.push(enr2.id)

    const history = await prisma.enrollment.findMany({ where: { studentId: student.id } })
    expect(history).toHaveLength(2)
  })

  it('refuses to bind one qr code to two people at the same time', async () => {
    const a = await trackedStudent('Олена', 'Коваль', new Date('2015-01-01'))
    const b = await trackedStudent('Марія', 'Коваль', new Date('2016-01-01'))

    const card1 = await prisma.personCard.create({
      data: { studentId: a.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
    })
    createdPersonCardIds.push(card1.id)

    await expect(async () => {
      const card2 = await prisma.personCard.create({
        data: { studentId: b.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
      })
      createdPersonCardIds.push(card2.id)
    }).rejects.toThrow()
  })
})

describe('RLS: students', () => {
  it('hides students from users without scopes', async () => {
    const student = await trackedStudent('Арсен', 'Коваль', new Date('2015-06-01'))

    const noScopeUser = await trackedAuthUser(`rls-nosc-student-${randomUUID()}@starland.test`)
    const visibleStudents = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from students where id = ${student.id}::uuid`
    })

    expect(visibleStudents).toHaveLength(0)
  })

  it('shows students to users with global students.read scope', async () => {
    const student = await trackedStudent('Богдан', 'Петренко', new Date('2015-07-01'))

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
    const student1 = await trackedStudent('Володимир', 'Сергієнко', new Date('2015-08-01'))
    const student2 = await trackedStudent('Галина', 'Морозова', new Date('2015-09-01'))

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

    const currentStudent = await trackedStudent('Д', 'Поточний', new Date('2015-10-01'))
    const pastStudent = await trackedStudent('П', 'Минулий', new Date('2015-11-01'))

    // Current student: active enrollment (to_date is null)
    const enr1 = await prisma.enrollment.create({
      data: { studentId: currentStudent.id, classId: cls.id, fromDate: new Date('2026-09-01') },
    })
    createdEnrollmentIds.push(enr1.id)

    // Past student: ended enrollment (to_date in past)
    const enr2 = await prisma.enrollment.create({
      data: { studentId: pastStudent.id, classId: cls.id, fromDate: new Date('2025-09-01'), toDate: new Date('2026-06-30') },
    })
    createdEnrollmentIds.push(enr2.id)

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

    const student1 = await trackedStudent('Є', 'Студент1', new Date('2015-12-01'))
    const student2 = await trackedStudent('Ж', 'Студент2', new Date('2016-01-01'))

    // Create linked accounts
    const la1 = await prisma.linkedAccount.create({
      data: { ownerUserId: user1AppUser.id, studentId: student1.id, linkedBy: user1AppUser.id },
    })
    createdLinkedAccountIds.push(la1.id)

    const la2 = await prisma.linkedAccount.create({
      data: { ownerUserId: user2AppUser.id, studentId: student2.id, linkedBy: user2AppUser.id },
    })
    createdLinkedAccountIds.push(la2.id)

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

describe('RLS: default-deny on unscoped tables', () => {
  it('guardian_persons, guardianships, person_cards, student_measurements return zero rows for users without explicit policies', async () => {
    // Create test data (not in rolled-back asService transactions)
    const student = await trackedStudent('Тест', 'Студент', new Date('2015-01-01'))

    const guardian = await prisma.guardianPerson.create({
      data: { firstName: 'Тест', lastName: 'Опікун' },
    })

    const guardianship = await prisma.guardianship.create({
      data: {
        studentId: student.id,
        personId: guardian.id,
        relation: 'parent',
      },
    })
    createdGuardianshipIds.push(guardianship.id)

    const card = await prisma.personCard.create({
      data: { studentId: student.id, qrCode: 'TEST-DEFAULT-DENY', validFrom: new Date('2026-09-01') },
    })
    createdPersonCardIds.push(card.id)

    const appUser = await prisma.appUser.create({
      data: { authUserId: randomUUID(), email: `measure-${randomUUID()}@test.local`, fullName: 'Measurer' },
    })
    const measurement = await prisma.studentMeasurement.create({
      data: {
        studentId: student.id,
        measuredOn: new Date('2026-09-01'),
        heightCm: 150,
        enteredBy: appUser.id,
      },
    })
    createdStudentMeasurementIds.push(measurement.id)

    // Create user with no scopes
    const noScopeUser = await trackedAuthUser(`rls-default-deny-${randomUUID()}@starland.test`)

    // Verify all four tables return zero rows
    const guardianPersonRows = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from guardian_persons`
    })
    expect(guardianPersonRows).toHaveLength(0)

    const guardianshipRows = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from guardianships`
    })
    expect(guardianshipRows).toHaveLength(0)

    const personCardRows = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from person_cards`
    })
    expect(personCardRows).toHaveLength(0)

    const measurementRows = await asUser(noScopeUser, async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`select id from student_measurements`
    })
    expect(measurementRows).toHaveLength(0)

    // Cleanup
    await prisma.appUser.delete({ where: { id: appUser.id } })
  })
})
