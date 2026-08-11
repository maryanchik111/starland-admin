import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { updateStudentWithPermissions } from '../src/lib/students/update-student.js'

const createdStudentIds: string[] = []
const createdYearIds: string[] = []

async function makeStudentInClass() {
  const year = await prisma.academicYear.create({
    data: {
      name: `Y-update-${randomUUID()}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 5, name: `5-Б-${randomUUID().slice(0, 8)}` },
  })
  const student = await prisma.student.create({
    data: { firstName: 'Оригінал', lastName: 'Прізвище', bornOn: new Date('2015-05-05') },
  })
  createdStudentIds.push(student.id)
  return { cls, student }
}

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'students', entityId: id } })
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

describe('updateStudentWithPermissions', () => {
  it('throws ForbiddenError without students.write in the student\'s class', async () => {
    const { cls, student } = await makeStudentInClass()
    await expect(
      updateStudentWithPermissions(
        new EffectivePermissions([]),
        { authUserId: randomUUID() },
        { id: student.id, classId: cls.id },
        { livingAddress: 'вул. Нова, 1' },
      ),
    ).rejects.toThrow(ForbiddenError)
  })

  it('updates firstName, lastName, and bornOn', async () => {
    const { cls, student } = await makeStudentInClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await updateStudentWithPermissions(
      permissions,
      { authUserId: randomUUID() },
      { id: student.id, classId: cls.id },
      { firstName: 'Оновлений', lastName: 'Нове Прізвище', bornOn: '2015-06-15' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.firstName).toBe('Оновлений')
    expect(updated.lastName).toBe('Нове Прізвище')
    expect(updated.bornOn.toISOString().slice(0, 10)).toBe('2015-06-15')
  })

  it('updates middleName', async () => {
    const { cls, student } = await makeStudentInClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await updateStudentWithPermissions(
      permissions,
      { authUserId: randomUUID() },
      { id: student.id, classId: cls.id },
      { middleName: 'Іванович' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.middleName).toBe('Іванович')
  })

  it('records who entered the parental consent, from the actor, never the request body', async () => {
    const { cls, student } = await makeStudentInClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    const authUserId = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${`update-student-consent-${authUserId}@admin-starland.test`}, '', now(), now(), now())
      `
      await tx.appUser.create({
        data: { authUserId, fullName: 'Актор Оновлення Згоди', email: `update-student-consent-${authUserId}@admin-starland.test` },
      })
    })
    const actor = await prisma.appUser.findFirstOrThrow({ where: { authUserId } })

    await updateStudentWithPermissions(
      permissions,
      { authUserId },
      { id: student.id, classId: cls.id },
      { parentalConsentGivenAt: '2026-08-01' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.parentalConsentGivenAt?.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(updated.parentalConsentEnteredBy).toBe(actor.id)

    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  })

  it('does not reassign parentalConsentEnteredBy when the consent date is resent unchanged', async () => {
    const { cls, student } = await makeStudentInClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    const firstActorAuthId = randomUUID()
    const secondActorAuthId = randomUUID()
    await prisma.$transaction(async (tx) => {
      for (const [authUserId, name] of [
        [firstActorAuthId, 'Перший Актор'],
        [secondActorAuthId, 'Другий Актор'],
      ] as const) {
        await tx.$executeRaw`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
          values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${`update-student-consent-${authUserId}@admin-starland.test`}, '', now(), now(), now())
        `
        await tx.appUser.create({ data: { authUserId, fullName: name, email: `update-student-consent-${authUserId}@admin-starland.test` } })
      }
    })
    const firstActor = await prisma.appUser.findFirstOrThrow({ where: { authUserId: firstActorAuthId } })

    await updateStudentWithPermissions(
      permissions,
      { authUserId: firstActorAuthId },
      { id: student.id, classId: cls.id },
      { parentalConsentGivenAt: '2026-08-01' },
    )
    // Second save resends the SAME date alongside an unrelated field change —
    // exactly what the inline edit form does (it always sends every field).
    await updateStudentWithPermissions(
      permissions,
      { authUserId: secondActorAuthId },
      { id: student.id, classId: cls.id },
      { parentalConsentGivenAt: '2026-08-01', livingAddress: 'вул. Інша, 2' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.parentalConsentEnteredBy).toBe(firstActor.id)
    expect(updated.livingAddress).toBe('вул. Інша, 2')

    await prisma.appUser.deleteMany({ where: { authUserId: { in: [firstActorAuthId, secondActorAuthId] } } })
    await prisma.$executeRaw`delete from auth.users where id in (${firstActorAuthId}::uuid, ${secondActorAuthId}::uuid)`
  })

  it('leaves untouched fields as-is when only one field is sent', async () => {
    const { cls, student } = await makeStudentInClass()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await updateStudentWithPermissions(
      permissions,
      { authUserId: randomUUID() },
      { id: student.id, classId: cls.id },
      { criticalNote: 'Алергія на горіхи' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.firstName).toBe('Оригінал')
    expect(updated.lastName).toBe('Прізвище')
    expect(updated.criticalNote).toBe('Алергія на горіхи')
  })
})
