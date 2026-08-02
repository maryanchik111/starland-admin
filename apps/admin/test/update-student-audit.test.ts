import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions } from '@starland/domain'
import { updateStudentWithPermissions } from '../src/lib/students/update-student.js'

/**
 * Regression coverage for final-review finding C2.
 *
 * `updateStudentWithPermissions` writes through the privileged `prisma`
 * client, which never sets `request.jwt.claims`. `trg_write_audit_log_redacted`
 * resolves its actor with `current_app_user_id()` -> `auth.uid()` ->
 * `request.jwt.claims`, so before the fix every student edit was audited with
 * `user_id = NULL`. CLAUDE.md §3 requires "хто, коли, що" — an audit row
 * without an actor does not satisfy it.
 *
 * This test goes through the real function against the real database and
 * asserts the audit row carries the editing user's `app_users.id`. It fails
 * against the previous implementation (user_id would be null).
 *
 * Fixtures are built with `@starland/db`'s public `prisma` export rather than
 * by importing packages/db's private test harness, which package-boundary
 * lint forbids reaching into from an app.
 */

const createdAuthUserIds: string[] = []
const createdStudentIds: string[] = []
const createdYearIds: string[] = []

async function makeUser(email: string): Promise<{ authUserId: string; userId: string }> {
  const authUserId = randomUUID()
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      values (${authUserId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', ${email}, '', now(), now(), now())
    `
    await tx.appUser.create({ data: { authUserId, fullName: email.split('@')[0] ?? email, email } })
  })
  createdAuthUserIds.push(authUserId)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId } })
  return { authUserId, userId: user.id }
}

async function makeStudentInClass() {
  const year = await prisma.academicYear.create({
    data: {
      name: `Y-audit-${randomUUID()}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 5, name: `5-А-${randomUUID().slice(0, 8)}` },
  })
  const student = await prisma.student.create({
    data: { firstName: 'Аудит', lastName: 'Актор', bornOn: new Date('2015-05-05') },
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
  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
})

describe('updateStudentWithPermissions audit actor', () => {
  it('records the editing user as the audit actor, not NULL', async () => {
    const { cls, student } = await makeStudentInClass()
    const editor = await makeUser(`audit-actor-${randomUUID()}@starland.test`)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await updateStudentWithPermissions(
      permissions,
      { authUserId: editor.authUserId },
      { id: student.id, classId: cls.id },
      { livingAddress: 'вул. Аудиторська, 7' },
    )

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: student.id } })
    expect(updated.livingAddress).toBe('вул. Аудиторська, 7')

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'students', entityId: student.id, action: 'UPDATE' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(editor.userId)
    // The redacted trigger must still be the one that wrote it: the real
    // address must never reach audit_logs.
    expect(JSON.stringify(logs[0]?.newValues)).not.toContain('Аудиторська')
  })

  it('does not leave the actor claim on the connection after the transaction', async () => {
    const { cls, student } = await makeStudentInClass()
    const editor = await makeUser(`audit-leak-${randomUUID()}@starland.test`)
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: cls.id },
    ])

    await updateStudentWithPermissions(
      permissions,
      { authUserId: editor.authUserId },
      { id: student.id, classId: cls.id },
      { livingAddress: 'вул. Перша, 1' },
    )

    const [{ claims }] = await prisma.$queryRaw<{ claims: string | null }[]>`
      select current_setting('request.jwt.claims', true) as claims
    `
    expect(claims === null || claims === '').toBe(true)
  })
})
