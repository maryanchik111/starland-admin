import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/index.js'
import { createAuthUser } from '../rls-harness.js'

/**
 * Everything `seedLargeDataset` created, in the shape the caller needs to
 * delete it again. Ids are returned explicitly rather than letting the test
 * clean up by a `where` pattern-match (`firstName startsWith 'Учень'`): a
 * pattern match would also delete rows left behind by a prior or concurrent
 * run, which is how a cleanup step turns into a data-loss step.
 */
export interface LargeDataset {
  teacherAuthId: string
  teacherUserId: string
  studentIds: string[]
  enrollmentIds: string[]
  classIds: string[]
  teachingAssignmentId: string
  subjectId: string
  academicPeriodId: string
  academicYearId: string
}

const STUDENT_COUNT = 350
const CLASS_COUNT = 14

/**
 * Seeds a realistic-volume dataset (350 students across 14 classes) plus one
 * teacher scoped to a single class through a teaching assignment, so an RLS
 * performance test measures a policy that actually has to discriminate:
 * the teacher may read ~25 of the 350 students, and every one of the other
 * 325 rows is a candidate the policy must reject.
 */
export async function seedLargeDataset(): Promise<LargeDataset> {
  const tag = randomUUID().slice(0, 8)

  const year = await prisma.academicYear.create({
    data: {
      name: `Perf-${tag}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  const period = await prisma.academicPeriod.create({
    data: {
      academicYearId: year.id,
      name: 'I семестр',
      ordinal: 1,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2026-12-28'),
    },
  })
  const subject = await prisma.subject.create({
    data: { code: `perf-math-${tag}`, name: 'Математика' },
  })

  const classes = await Promise.all(
    Array.from({ length: CLASS_COUNT }, (_, i) =>
      prisma.class.create({
        data: { academicYearId: year.id, gradeLevel: (i % 9) + 1, name: `P${i}-А-${tag}` },
      }),
    ),
  )

  const students = await prisma.student.createManyAndReturn({
    data: Array.from({ length: STUDENT_COUNT }, (_, i) => ({
      firstName: `Учень${tag}-${i}`,
      lastName: `Прізвище${tag}-${i % 60}`,
      bornOn: new Date('2014-01-01'),
    })),
    select: { id: true },
  })

  const enrollments = await prisma.enrollment.createManyAndReturn({
    data: students.map((s, i) => ({
      studentId: s.id,
      classId: classes[i % classes.length]!.id,
      fromDate: new Date('2026-09-01'),
    })),
    select: { id: true },
  })

  const teacherAuthId = await createAuthUser(`perf-teacher-${tag}@starland.test`)
  const teacher = await prisma.appUser.findFirstOrThrow({ where: { authUserId: teacherAuthId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'teacher' } })

  const assignment = await prisma.teachingAssignment.create({
    data: {
      teacherUserId: teacher.id,
      subjectId: subject.id,
      classId: classes[0]!.id,
      periodId: period.id,
    },
  })
  await prisma.userRole.create({ data: { userId: teacher.id, roleId: role.id } })

  return {
    teacherAuthId,
    teacherUserId: teacher.id,
    studentIds: students.map((s) => s.id),
    enrollmentIds: enrollments.map((e) => e.id),
    classIds: classes.map((c) => c.id),
    teachingAssignmentId: assignment.id,
    subjectId: subject.id,
    academicPeriodId: period.id,
    academicYearId: year.id,
  }
}

/**
 * Removes everything `seedLargeDataset` created, in FK-safe order. Only the
 * ids handed back by the seed are touched.
 */
export async function cleanupLargeDataset(data: LargeDataset): Promise<void> {
  await prisma.enrollment.deleteMany({ where: { id: { in: data.enrollmentIds } } })
  await prisma.teachingAssignment.deleteMany({ where: { id: data.teachingAssignmentId } })
  await prisma.userRole.deleteMany({ where: { userId: data.teacherUserId } })
  await prisma.student.deleteMany({ where: { id: { in: data.studentIds } } })
  // The scope projection is trigger-maintained; drop any leftover rows so the
  // app_user delete below cannot trip an FK.
  await prisma.$executeRaw`delete from user_effective_scopes where user_id = ${data.teacherUserId}::uuid`
  await prisma.appUser.deleteMany({ where: { id: data.teacherUserId } })
  await prisma.$executeRaw`delete from auth.users where id = ${data.teacherAuthId}::uuid`
  await prisma.class.deleteMany({ where: { id: { in: data.classIds } } })
  await prisma.subject.deleteMany({ where: { id: data.subjectId } })
  await prisma.academicPeriod.deleteMany({ where: { id: data.academicPeriodId } })
  await prisma.academicYear.deleteMany({ where: { id: data.academicYearId } })
}
