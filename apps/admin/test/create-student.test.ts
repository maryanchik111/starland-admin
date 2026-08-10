import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { createStudentWithPermissions } from '../src/lib/students/create-student.js'

const createdStudentIds: string[] = []

const studentsWriteGlobal = new EffectivePermissions([
  { permissionCode: 'students.write', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'students', entityId: id } })
    await prisma.student.deleteMany({ where: { id } })
  }
})

describe('createStudentWithPermissions', () => {
  it('throws ForbiddenError without a global students.write grant', async () => {
    // Only a class-scoped grant, no global one — creating a new student has
    // no class to scope against yet, so this must still be rejected.
    const classScoped = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: randomUUID() },
    ])
    await expect(
      createStudentWithPermissions(classScoped, { authUserId: randomUUID() }, {
        firstName: 'Новий',
        lastName: 'Учень',
        bornOn: '2016-01-01',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates the student and audits the actor without PII', async () => {
    const authUserId = randomUUID()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${`create-student-${authUserId}@admin-starland.test`}, '', now(), now(), now())
      `
      await tx.appUser.create({
        data: { authUserId, fullName: 'Актор Створення', email: `create-student-${authUserId}@admin-starland.test` },
      })
    })
    const actor = await prisma.appUser.findFirstOrThrow({ where: { authUserId } })

    const result = await createStudentWithPermissions(studentsWriteGlobal, { authUserId }, {
      firstName: 'Марія',
      lastName: 'Ковальчук',
      bornOn: '2016-03-20',
      livingAddress: 'вул. Шкільна, 5',
    })
    createdStudentIds.push(result.id)

    const created = await prisma.student.findUniqueOrThrow({ where: { id: result.id } })
    expect(created.firstName).toBe('Марія')
    expect(created.lastName).toBe('Ковальчук')
    expect(created.bornOn.toISOString().slice(0, 10)).toBe('2016-03-20')

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'students', entityId: result.id, action: 'INSERT' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.id)
    expect(JSON.stringify(logs[0]?.newValues)).not.toContain('Ковальчук')

    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  })

  it('rejects a payload missing required fields', async () => {
    await expect(
      createStudentWithPermissions(studentsWriteGlobal, { authUserId: randomUUID() }, {
        firstName: 'Без',
      }),
    ).rejects.toThrow()
  })
})
