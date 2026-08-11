import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { assignClassWithPermissions } from '../src/lib/students/assign-class.js'

const createdStudentIds: string[] = []
const createdYearIds: string[] = []

async function makeClass(yearSuffix: string) {
  const year = await prisma.academicYear.create({
    data: {
      name: `Y-assign-${yearSuffix}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 5, name: `5-B-${randomUUID().slice(0, 8)}` },
  })
  return cls
}

async function makeStudent() {
  const student = await prisma.student.create({
    data: { firstName: 'Enrollment', lastName: 'Test', bornOn: new Date('2015-05-05') },
  })
  createdStudentIds.push(student.id)
  return student
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

describe('assignClassWithPermissions', () => {
  it('throws ForbiddenError without students.write on the target class', async () => {
    const cls = await makeClass(randomUUID())
    const student = await makeStudent()
    await expect(
      assignClassWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { studentId: student.id }, {
        classId: cls.id,
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError for an unknown class', async () => {
    const student = await makeStudent()
    const unknownClassId = randomUUID()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: unknownClassId },
    ])
    await expect(
      assignClassWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
        classId: unknownClassId,
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('creates the first active enrollment for a student with none yet', async () => {
    const cls = await makeClass(randomUUID())
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    const result = await assignClassWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
      classId: cls.id,
    })

    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: result.id } })
    expect(enrollment.classId).toBe(cls.id)
    expect(enrollment.toDate).toBeNull()
  })

  it('closes the current active enrollment and opens a new one for a class change, never UPDATEs classId', async () => {
    const oldClass = await makeClass(randomUUID())
    const newClass = await makeClass(randomUUID())
    const student = await makeStudent()
    const oldEnrollment = await prisma.enrollment.create({
      data: { studentId: student.id, classId: oldClass.id, fromDate: new Date('2026-09-01'), statusKind: 'active' },
    })
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: newClass.id },
    ])

    const result = await assignClassWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
      classId: newClass.id,
    })

    const closedOld = await prisma.enrollment.findUniqueOrThrow({ where: { id: oldEnrollment.id } })
    expect(closedOld.toDate).not.toBeNull()
    expect(closedOld.classId).toBe(oldClass.id) // never rewritten in place
    expect(closedOld.statusKind).toBe('transferred_internal')

    const newEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: result.id } })
    expect(newEnrollment.classId).toBe(newClass.id)
    expect(newEnrollment.toDate).toBeNull()

    const activeEnrollments = await prisma.enrollment.findMany({ where: { studentId: student.id, toDate: null } })
    expect(activeEnrollments).toHaveLength(1)
  })

  it('throws ConflictError when reassigning to the same class the student is already in', async () => {
    const cls = await makeClass(randomUUID())
    const student = await makeStudent()
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: cls.id, fromDate: new Date('2026-09-01'), statusKind: 'active' },
    })
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await expect(
      assignClassWithPermissions(permissions, { authUserId: randomUUID() }, { studentId: student.id }, {
        classId: cls.id,
      }),
    ).rejects.toThrow(ConflictError)
  })
})
