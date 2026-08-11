import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { changeEnrollmentStatusWithPermissions } from '../src/lib/students/change-enrollment-status.js'

const createdStudentIds: string[] = []
const createdYearIds: string[] = []

async function makeClass(yearSuffix: string) {
  const year = await prisma.academicYear.create({
    data: { name: `Y-status-${yearSuffix}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 9, name: `9-A-${randomUUID().slice(0, 8)}` },
  })
  return cls
}

async function makeEnrolledStudent(classId: string) {
  const student = await prisma.student.create({
    data: { firstName: 'Status', lastName: 'Test', bornOn: new Date('2011-05-05') },
  })
  createdStudentIds.push(student.id)
  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, classId, fromDate: new Date('2026-09-01'), statusKind: 'active' },
  })
  return { student, enrollment }
}

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.enrollment.deleteMany({ where: { studentId: id } })
    await prisma.student.deleteMany({ where: { id } })
  }
  while (createdYearIds.length > 0) {
    const yearId = createdYearIds.pop()
    if (!yearId) continue
    await prisma.class.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicYear.deleteMany({ where: { id: yearId } })
  }
})

describe('changeEnrollmentStatusWithPermissions', () => {
  it('throws ForbiddenError without students.write on the enrollment class', async () => {
    const cls = await makeClass(randomUUID())
    const { student } = await makeEnrolledStudent(cls.id)
    await expect(
      changeEnrollmentStatusWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { studentId: student.id }, {
        status: 'graduated',
        reason: 'Закінчив 9 клас, свідоцтво видано',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError when the student has no active enrollment', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Nobody', lastName: 'Home', bornOn: new Date('2011-05-05') },
    })
    createdStudentIds.push(student.id)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'global', scopeId: null },
    ])
    await expect(
      changeEnrollmentStatusWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
        status: 'withdrawn',
        reason: 'Переїзд родини до іншого міста',
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('rejects a reason shorter than 10 characters', async () => {
    const cls = await makeClass(randomUUID())
    const { student } = await makeEnrolledStudent(cls.id)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])
    await expect(
      changeEnrollmentStatusWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
        status: 'withdrawn',
        reason: 'бо',
      }),
    ).rejects.toThrow()
  })

  it('closes the active enrollment with the given status and reason, and does not open a new one', async () => {
    const cls = await makeClass(randomUUID())
    const { student, enrollment } = await makeEnrolledStudent(cls.id)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await changeEnrollmentStatusWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
      status: 'graduated',
      reason: 'Закінчив 9 клас, свідоцтво видано',
    })

    const closed = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })
    expect(closed.toDate).not.toBeNull()
    expect(closed.statusKind).toBe('graduated')
    expect(closed.reason).toBe('Закінчив 9 клас, свідоцтво видано')

    const activeEnrollments = await prisma.enrollment.findMany({ where: { studentId: student.id, toDate: null } })
    expect(activeEnrollments).toHaveLength(0)
  })

  it('throws NotFoundError on a second call, since the enrollment is already closed', async () => {
    const cls = await makeClass(randomUUID())
    const { student } = await makeEnrolledStudent(cls.id)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await changeEnrollmentStatusWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
      status: 'withdrawn',
      reason: 'Переїзд родини до іншого міста',
    })

    await expect(
      changeEnrollmentStatusWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
        status: 'withdrawn',
        reason: 'Друга спроба закрити те саме зарахування',
      }),
    ).rejects.toThrow(NotFoundError)
  })
})
