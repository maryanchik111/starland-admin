import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { unlinkGuardianWithPermissions } from '../src/lib/students/unlink-guardian.js'

const createdStudentIds: string[] = []
const createdPersonIds: string[] = []
const createdYearIds: string[] = []

async function makeClass() {
  const year = await prisma.academicYear.create({
    data: { name: `Y-unlink-guardian-${randomUUID()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 3, name: `3-Б-${randomUUID().slice(0, 8)}` },
  })
  return cls
}

async function makeLinkedGuardian(studentId: string) {
  const person = await prisma.guardianPerson.create({
    data: { firstName: 'Оксана', lastName: 'Сидоренко', phone: '+380631112233' },
  })
  createdPersonIds.push(person.id)
  const guardianship = await prisma.guardianship.create({
    data: { studentId, personId: person.id, relation: 'мати' },
  })
  return guardianship
}

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.guardianship.deleteMany({ where: { studentId: id } })
    await prisma.student.deleteMany({ where: { id } })
  }
  while (createdPersonIds.length > 0) {
    const id = createdPersonIds.pop()
    if (!id) continue
    await prisma.guardianship.deleteMany({ where: { personId: id } })
    await prisma.guardianPerson.deleteMany({ where: { id } })
  }
  while (createdYearIds.length > 0) {
    const yearId = createdYearIds.pop()
    if (!yearId) continue
    await prisma.class.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicYear.deleteMany({ where: { id: yearId } })
  }
})

describe('unlinkGuardianWithPermissions', () => {
  it('throws ForbiddenError without students.write on the class', async () => {
    const cls = await makeClass()
    const student = await prisma.student.create({
      data: { firstName: 'Відвʼязка', lastName: 'Тест', bornOn: new Date('2016-01-01') },
    })
    createdStudentIds.push(student.id)
    const guardianship = await makeLinkedGuardian(student.id)

    await expect(
      unlinkGuardianWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { classId: cls.id }, guardianship.id),
    ).rejects.toThrow(ForbiddenError)
  })

  it('soft-deletes the guardianship (sets deletedAt, row still exists)', async () => {
    const cls = await makeClass()
    const student = await prisma.student.create({
      data: { firstName: 'Відвʼязка', lastName: 'Тест2', bornOn: new Date('2016-01-01') },
    })
    createdStudentIds.push(student.id)
    const guardianship = await makeLinkedGuardian(student.id)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await unlinkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, { classId: cls.id }, guardianship.id)

    const row = await prisma.guardianship.findUniqueOrThrow({ where: { id: guardianship.id } })
    expect(row.deletedAt).not.toBeNull()
    expect(row.studentId).toBe(student.id) // physically still present, not DELETEd
  })

  it('throws NotFoundError for an unknown or already-unlinked guardianship', async () => {
    const cls = await makeClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await expect(
      unlinkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, { classId: cls.id }, randomUUID()),
    ).rejects.toThrow(NotFoundError)
  })
})
