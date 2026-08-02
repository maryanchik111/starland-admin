import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

async function grantScope(userId: string, permissionCode: string) {
  await prisma.$executeRaw`
    insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
    values (${userId}::uuid, ${permissionCode}, 'global'::scope_type, null, now(), now())
  `
}

describe('health notes', () => {
  it('lets a nurse read the note and logs the access', async () => {
    const nurse = await makeUserWithRole(`nurse-${Date.now()}@starland.test`, 'nurse')
    // Task 9 (refresh_user_effective_scopes) does not exist yet, so the
    // user_roles assignment above documents intent but does not by itself
    // populate user_effective_scopes. Grant the scope directly for this test.
    await grantScope(nurse.userId, 'health_notes.read')

    const student = await prisma.student.create({
      data: { firstName: 'Тарас', lastName: 'Шевченко', bornOn: new Date('2014-03-09') },
    })
    // write_health_note relies on current_app_user_id() (from auth.uid()) to
    // stamp the audit log's user_id (NOT NULL). That is only populated when
    // the JWT-claims session context is set, i.e. when running through
    // asUser — the bare privileged `prisma` client has no such context. Use
    // a separate writer identity so the write's own audit entry doesn't
    // muddy the assertion below about the nurse's read producing one log row.
    const writer = await makeUserWithRole(`writer-${Date.now()}@starland.test`, 'nurse')
    await grantScope(writer.userId, 'health.write')
    await asUser(writer.authId, (c) => c.$executeRaw`select write_health_note(${student.id}::uuid, 'Астма, інгалятор у медкабінеті')`)

    const note = await asUser(nurse.authId, async (c) => {
      const r = await c.$queryRaw<{ read_health_note: string }[]>`select read_health_note(${student.id}::uuid)`
      return r[0]?.read_health_note
    })

    expect(note).toBe('Астма, інгалятор у медкабінеті')

    const logs = await prisma.sensitiveAccessLog.findMany({
      where: { userId: nurse.userId, entityId: student.id },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.entityType).toBe('student_health_note')
  })

  it('refuses to return the note to a secretary', async () => {
    const secretary = await makeUserWithRole(`secretary-${Date.now()}@starland.test`, 'secretary')
    const student = await prisma.student.create({
      data: { firstName: 'Леся', lastName: 'Українка', bornOn: new Date('2014-02-25') },
    })
    // Since finding I1, write_health_note itself requires `health.write`, so
    // the note has to be seeded by an identity that legitimately holds it.
    // (Before I1 the secretary could write it — that WAS the bug.)
    const writer = await makeUserWithRole(`writer-sec-${Date.now()}@starland.test`, 'nurse')
    await grantScope(writer.userId, 'health.write')
    await asUser(writer.authId, (c) => c.$executeRaw`select write_health_note(${student.id}::uuid, 'Алергія на пеніцилін')`)

    await expect(
      asUser(secretary.authId, async (c) => c.$queryRaw`select read_health_note(${student.id}::uuid)`),
    ).rejects.toThrow(/insufficient_permission/)
  })

  it('refuses to let a user without health.write overwrite a note', async () => {
    const secretary = await makeUserWithRole(`nowrite-${Date.now()}@starland.test`, 'secretary')
    const student = await prisma.student.create({
      data: { firstName: 'Чужа', lastName: 'Нотатка', bornOn: new Date('2014-04-04') },
    })

    await expect(
      asUser(secretary.authId, (c) => c.$executeRaw`select write_health_note(${student.id}::uuid, 'Підроблена нотатка')`),
    ).rejects.toThrow(/insufficient_permission/)

    const notes = await prisma.studentHealthNote.findMany({ where: { studentId: student.id } })
    expect(notes).toHaveLength(0)
  })

  it('blocks direct select on student_health_notes even with global health_notes.read scope', async () => {
    const user = await makeUserWithRole(`directread-${Date.now()}@starland.test`, 'nurse')
    await grantScope(user.userId, 'health_notes.read')
    await grantScope(user.userId, 'health.write')

    const student = await prisma.student.create({
      data: { firstName: 'Пряме', lastName: 'Читання', bornOn: new Date('2014-05-05') },
    })
    await asUser(user.authId, (c) => c.$executeRaw`select write_health_note(${student.id}::uuid, 'Секретна нотатка')`)

    const rows = await asUser(user.authId, async (c) => {
      return c.$queryRaw<{ content_cipher: Buffer }[]>`select content_cipher from student_health_notes where student_id = ${student.id}::uuid`
    })

    expect(rows).toHaveLength(0)
  })

  it('refuses direct execution of health_key() to any authenticated role', async () => {
    const user = await makeUserWithRole(`nokey-${Date.now()}@starland.test`, 'nurse')

    await expect(
      asUser(user.authId, async (c) => c.$queryRaw`select health_key()`),
    ).rejects.toThrow(/permission denied/)
  })

  it('follows normal RLS on student_health based on health.read scope', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Довідник', lastName: 'Здоровʼя', bornOn: new Date('2014-06-06') },
    })
    await prisma.studentHealth.create({
      data: { studentId: student.id, healthGroup: 'basic', allergyCodes: [], chronicCodes: [] },
    })

    const withScope = await makeUserWithRole(`healthread-${Date.now()}@starland.test`, 'nurse')
    await grantScope(withScope.userId, 'health.read')

    const withoutScope = await makeUserWithRole(`nohealthread-${Date.now()}@starland.test`, 'secretary')

    const visibleWithScope = await asUser(withScope.authId, async (c) => {
      return c.$queryRaw<{ id: string }[]>`select id from student_health where student_id = ${student.id}::uuid`
    })
    expect(visibleWithScope).toHaveLength(1)

    const visibleWithoutScope = await asUser(withoutScope.authId, async (c) => {
      return c.$queryRaw<{ id: string }[]>`select id from student_health where student_id = ${student.id}::uuid`
    })
    expect(visibleWithoutScope).toHaveLength(0)
  })
})
