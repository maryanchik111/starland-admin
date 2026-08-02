import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

/**
 * Regression coverage for final-review finding C1.
 *
 * Every other RLS test in this package queries ONE table directly with raw
 * SQL. None of them goes through a Prisma relation `include` on the
 * RLS-scoped connection, which is exactly what the student pages do — so
 * nothing caught the fact that `enrollments`, `guardianships`,
 * `guardian_persons` and `student_measurements` had RLS enabled with zero
 * read policies and therefore returned empty relations for every user.
 *
 * These tests deliberately mirror the shape of the real page queries
 * (`student.findMany({ include: { enrollments: { include: { class: true } } } })`)
 * rather than asserting on the policy SQL, so they fail if the policies are
 * dropped, narrowed, or if a future relation is added without one.
 */

const createdAuthUserIds: string[] = []
const createdYearIds: string[] = []
const createdStudentIds: string[] = []
const createdEnrollmentIds: string[] = []
const createdGuardianshipIds: string[] = []
const createdGuardianPersonIds: string[] = []
const createdMeasurementIds: string[] = []

async function trackedAuthUser(email: string): Promise<{ authId: string; userId: string }> {
  const authId = await createAuthUser(email)
  createdAuthUserIds.push(authId)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  return { authId, userId: user.id }
}

async function makeClass(label: string) {
  const year = await prisma.academicYear.create({
    data: {
      name: `Y-${label}-${randomUUID()}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  createdYearIds.push(year.id)
  return prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 5, name: `${label}-${randomUUID().slice(0, 8)}` },
  })
}

/**
 * Full fixture for one student: an active enrollment in a fresh class, one
 * guardian, and one measurement — i.e. every relation the student detail
 * page renders.
 */
async function makeStudentWithRelations(label: string) {
  const cls = await makeClass(label)
  const student = await prisma.student.create({
    data: { firstName: 'Реляція', lastName: label, bornOn: new Date('2015-03-03') },
  })
  createdStudentIds.push(student.id)

  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, classId: cls.id, fromDate: new Date('2026-09-01') },
  })
  createdEnrollmentIds.push(enrollment.id)

  const person = await prisma.guardianPerson.create({
    data: { firstName: 'Опікун', lastName: label, phone: '+380000000000' },
  })
  createdGuardianPersonIds.push(person.id)

  const guardianship = await prisma.guardianship.create({
    data: { studentId: student.id, personId: person.id, relation: 'mother' },
  })
  createdGuardianshipIds.push(guardianship.id)

  const enteredBy = await trackedAuthUser(`rel-entered-by-${randomUUID()}@starland.test`)
  const measurement = await prisma.studentMeasurement.create({
    data: {
      studentId: student.id,
      measuredOn: new Date('2026-10-01'),
      heightCm: 140,
      enteredBy: enteredBy.userId,
    },
  })
  createdMeasurementIds.push(measurement.id)

  return { cls, student, person, guardianship, measurement }
}

async function grantClassScope(userId: string, classId: string, permissionCode = 'students.read') {
  await prisma.$executeRaw`
    insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
    values (${userId}::uuid, ${permissionCode}, 'class'::scope_type, ${classId}::uuid, now(), now())
  `
}

async function grantGlobalScope(userId: string, permissionCode: string) {
  await prisma.$executeRaw`
    insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
    values (${userId}::uuid, ${permissionCode}, 'global'::scope_type, null, now(), now())
  `
}

afterEach(async () => {
  while (createdMeasurementIds.length > 0) {
    const id = createdMeasurementIds.pop()
    if (id) await prisma.studentMeasurement.deleteMany({ where: { id } })
  }
  while (createdGuardianshipIds.length > 0) {
    const id = createdGuardianshipIds.pop()
    if (id) await prisma.guardianship.deleteMany({ where: { id } })
  }
  while (createdGuardianPersonIds.length > 0) {
    const id = createdGuardianPersonIds.pop()
    if (id) await prisma.guardianPerson.deleteMany({ where: { id } })
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
    await prisma.academicYear.deleteMany({ where: { id: yearId } })
  }
  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    const user = await prisma.appUser.findFirst({ where: { authUserId } })
    if (user) {
      await prisma.$executeRaw`delete from user_effective_scopes where user_id = ${user.id}::uuid`
    }
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
})

describe('RLS: student relations through a Prisma include', () => {
  it('returns the enrollment and its class to a class-scoped user', async () => {
    const { cls, student } = await makeStudentWithRelations('Клас')
    const reader = await trackedAuthUser(`rel-class-reader-${randomUUID()}@starland.test`)
    await grantClassScope(reader.userId, cls.id)
    // `classes_read` is a separate permission from `students.read`; a user
    // who can see the enrollment can only see the CLASS behind it if they
    // also hold `classes.read` for it. See the dedicated test below for what
    // happens when they do not.
    await grantClassScope(reader.userId, cls.id, 'classes.read')

    const rows = await asUser(reader.authId, (tx) =>
      tx.student.findMany({
        where: { id: student.id },
        include: { enrollments: { include: { class: true } } },
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.enrollments).toHaveLength(1)
    expect(rows[0]?.enrollments[0]?.class.id).toBe(cls.id)
    expect(rows[0]?.enrollments[0]?.toDate).toBeNull()
  })

  it('returns the guardian person through guardianships to a class-scoped user', async () => {
    const { cls, student, person } = await makeStudentWithRelations('Опікун')
    const reader = await trackedAuthUser(`rel-guardian-reader-${randomUUID()}@starland.test`)
    await grantClassScope(reader.userId, cls.id)

    const rows = await asUser(reader.authId, (tx) =>
      tx.student.findMany({
        where: { id: student.id },
        include: { guardianships: { include: { person: true } } },
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.guardianships).toHaveLength(1)
    expect(rows[0]?.guardianships[0]?.person.id).toBe(person.id)
    expect(rows[0]?.guardianships[0]?.person.lastName).toBe('Опікун')
  })

  it('returns measurements to a class-scoped user', async () => {
    const { cls, student } = await makeStudentWithRelations('Вимір')
    const reader = await trackedAuthUser(`rel-measure-reader-${randomUUID()}@starland.test`)
    await grantClassScope(reader.userId, cls.id)

    const rows = await asUser(reader.authId, (tx) =>
      tx.student.findMany({ where: { id: student.id }, include: { measurements: true } }),
    )

    expect(rows[0]?.measurements).toHaveLength(1)
    expect(rows[0]?.measurements[0]?.heightCm).toBe(140)
  })

  it('returns every relation to a user with global students.read', async () => {
    const { cls, student, person } = await makeStudentWithRelations('Глобал')
    const reader = await trackedAuthUser(`rel-global-reader-${randomUUID()}@starland.test`)
    await grantGlobalScope(reader.userId, 'students.read')
    await grantGlobalScope(reader.userId, 'classes.read')

    const rows = await asUser(reader.authId, (tx) =>
      tx.student.findMany({
        where: { id: student.id },
        include: {
          enrollments: { include: { class: true } },
          guardianships: { include: { person: true } },
          measurements: true,
        },
      }),
    )

    expect(rows[0]?.enrollments[0]?.class.id).toBe(cls.id)
    expect(rows[0]?.guardianships[0]?.person.id).toBe(person.id)
    expect(rows[0]?.measurements).toHaveLength(1)
  })

  /**
   * Several seeded roles hold `students.read` at global scope WITHOUT any
   * `classes.read` (psychologist, speech_therapist, nurse, student_family —
   * see prisma/seed/roles.ts). For them the enrollment row is now visible but
   * the class behind it is not, so a Prisma `include: { class: true }` on a
   * REQUIRED relation throws "Inconsistent query result: Field class is
   * required to return data, got null". That is why the student pages resolve
   * class names with a second, separate query instead of a nested include —
   * this test pins the database behaviour that forces that shape.
   */
  it('exposes the enrollment but not its class to a student-reader without classes.read', async () => {
    const { cls, student } = await makeStudentWithRelations('БезКласів')
    const reader = await trackedAuthUser(`rel-noclassread-${randomUUID()}@starland.test`)
    await grantGlobalScope(reader.userId, 'students.read')

    const result = await asUser(reader.authId, async (tx) => ({
      enrollments: await tx.enrollment.findMany({ where: { studentId: student.id } }),
      classes: await tx.class.findMany({ where: { id: cls.id } }),
    }))

    expect(result.enrollments).toHaveLength(1)
    expect(result.classes).toHaveLength(0)

    await expect(
      asUser(reader.authId, (tx) =>
        tx.student.findMany({
          where: { id: student.id },
          include: { enrollments: { include: { class: true } } },
        }),
      ),
    ).rejects.toThrow(/Field class is required/)
  })

  it('hides the student and every relation from a user scoped to a different class', async () => {
    const { student } = await makeStudentWithRelations('Чужий')
    const otherClass = await makeClass('Інший')
    const reader = await trackedAuthUser(`rel-wrong-class-${randomUUID()}@starland.test`)
    await grantClassScope(reader.userId, otherClass.id)

    const rows = await asUser(reader.authId, (tx) =>
      tx.student.findMany({
        where: { id: student.id },
        include: {
          enrollments: { include: { class: true } },
          guardianships: { include: { person: true } },
          measurements: true,
        },
      }),
    )

    expect(rows).toHaveLength(0)
  })

  it('hides guardianships and enrollments even when queried directly by an unscoped user', async () => {
    const { student, guardianship } = await makeStudentWithRelations('Безправний')
    const reader = await trackedAuthUser(`rel-noscope-${randomUUID()}@starland.test`)

    const result = await asUser(reader.authId, async (tx) => ({
      enrollments: await tx.enrollment.findMany({ where: { studentId: student.id } }),
      guardianships: await tx.guardianship.findMany({ where: { studentId: student.id } }),
      persons: await tx.guardianPerson.findMany({ where: { guardianships: { some: { id: guardianship.id } } } }),
      measurements: await tx.studentMeasurement.findMany({ where: { studentId: student.id } }),
    }))

    expect(result.enrollments).toHaveLength(0)
    expect(result.guardianships).toHaveLength(0)
    expect(result.persons).toHaveLength(0)
    expect(result.measurements).toHaveLength(0)
  })
})
