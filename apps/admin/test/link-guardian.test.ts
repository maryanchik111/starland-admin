import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { linkGuardianWithPermissions } from '../src/lib/students/link-guardian.js'

const createdStudentIds: string[] = []
const createdPersonIds: string[] = []
const createdYearIds: string[] = []

async function makeClass() {
  const year = await prisma.academicYear.create({
    data: { name: `Y-link-guardian-${randomUUID()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 3, name: `3-А-${randomUUID().slice(0, 8)}` },
  })
  return cls
}

async function makeStudent() {
  const student = await prisma.student.create({
    data: { firstName: 'Опікуни', lastName: 'Тест', bornOn: new Date('2016-01-01') },
  })
  createdStudentIds.push(student.id)
  return student
}

async function makePerson() {
  const person = await prisma.guardianPerson.create({
    data: { firstName: 'Наталя', lastName: 'Петренко', phone: '+380501234567' },
  })
  createdPersonIds.push(person.id)
  return person
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

describe('linkGuardianWithPermissions', () => {
  it('throws ForbiddenError without students.write on the target class', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    await expect(
      linkGuardianWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, {
        studentId: student.id,
        classId: cls.id,
      }, { mode: 'new', firstName: 'Іван', lastName: 'Іваненко', relation: 'батько' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates a new guardian person and links them (mode: new)', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    const result = await linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
      studentId: student.id,
      classId: cls.id,
    }, { mode: 'new', firstName: 'Іван', lastName: 'Іваненко', phone: '+380671112233', relation: 'батько' })

    const guardianship = await prisma.guardianship.findUniqueOrThrow({ where: { id: result.id } })
    expect(guardianship.studentId).toBe(student.id)
    expect(guardianship.relation).toBe('батько')
    expect(guardianship.deletedAt).toBeNull()

    const person = await prisma.guardianPerson.findUniqueOrThrow({ where: { id: guardianship.personId } })
    createdPersonIds.push(person.id)
    expect(person.firstName).toBe('Іван')
  })

  it('links an existing guardian person to another student (mode: existing)', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    const person = await makePerson()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    const result = await linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
      studentId: student.id,
      classId: cls.id,
    }, { mode: 'existing', personId: person.id, relation: 'мати' })

    const guardianship = await prisma.guardianship.findUniqueOrThrow({ where: { id: result.id } })
    expect(guardianship.personId).toBe(person.id)
    expect(guardianship.relation).toBe('мати')
  })

  it('throws NotFoundError linking a person that does not exist', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await expect(
      linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
        studentId: student.id,
        classId: cls.id,
      }, { mode: 'existing', personId: randomUUID(), relation: 'мати' }),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError linking a guardian already actively linked to the student', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    const person = await makePerson()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])
    await linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
      studentId: student.id,
      classId: cls.id,
    }, { mode: 'existing', personId: person.id, relation: 'мати' })

    await expect(
      linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
        studentId: student.id,
        classId: cls.id,
      }, { mode: 'existing', personId: person.id, relation: 'мати' }),
    ).rejects.toThrow(ConflictError)
  })

  it('resurrects a soft-deleted guardianship instead of violating the unique constraint', async () => {
    const cls = await makeClass()
    const student = await makeStudent()
    const person = await makePerson()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])
    const first = await linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
      studentId: student.id,
      classId: cls.id,
    }, { mode: 'existing', personId: person.id, relation: 'мати' })
    await prisma.guardianship.update({ where: { id: first.id }, data: { deletedAt: new Date() } })

    const relinked = await linkGuardianWithPermissions(permissions, { authUserId: randomUUID() }, {
      studentId: student.id,
      classId: cls.id,
    }, { mode: 'existing', personId: person.id, relation: 'опікун' })

    expect(relinked.id).toBe(first.id)
    const row = await prisma.guardianship.findUniqueOrThrow({ where: { id: first.id } })
    expect(row.deletedAt).toBeNull()
    expect(row.relation).toBe('опікун')
  })
})
