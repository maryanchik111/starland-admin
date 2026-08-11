import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import {
  getStudentHealthWithPermissions,
  getStudentHealthNoteWithPermissions,
  updateStudentHealthWithPermissions,
  updateStudentHealthNoteWithPermissions,
} from '../src/lib/students/health.js'

/**
 * Fixtures are built with @starland/db's public `prisma` export rather than
 * by importing packages/db's private test harness (`rls-harness.ts`), which
 * package-boundary lint forbids reaching into from an app -- same reasoning
 * as update-student-audit.test.ts.
 *
 * `getStudentHealthWithPermissions`/`getStudentHealthNoteWithPermissions` go
 * through `withUserContext`, which requires a real `app_users` row (and, for
 * the note, a real role+scope resolved all the way to `has_scope()` inside
 * `read_health_note`/`write_health_note`) tied to a genuine `auth.users`
 * row -- there is no way to fabricate that with `EffectivePermissions`
 * alone the way the write-path tests below can, because `withUserContext`
 * re-derives identity from the database itself via `auth.uid()`, not from
 * whatever `EffectivePermissions` object the test constructs in TypeScript.
 * The `ForbiddenError` tests do not need that: `requirePermission` throws
 * before any query runs, so they exercise the pure application-level gate
 * with a permissions object built directly.
 */

const createdStudentIds: string[] = []
const createdAuthUserIds: string[] = []

async function makeStudent() {
  const student = await prisma.student.create({
    data: { firstName: 'Мед', lastName: 'Тест', bornOn: new Date('2015-05-05') },
  })
  createdStudentIds.push(student.id)
  return student
}

/**
 * `write_health_note` is `SECURITY DEFINER` but still re-checks
 * `has_scope('health.write', 'global')` internally via
 * `current_app_user_id()` -> `auth.uid()` -> `request.jwt.claims`. That
 * check resolves against a REAL `app_users` row tied to a real `auth.users`
 * row and a real `user_effective_scopes` grant -- unlike
 * `updateStudentHealthWithPermissions` (a plain table write with no DB-side
 * permission check of its own), a random unlinked `authUserId` is not enough
 * to exercise the success path here; the DB's own gate would reject it with
 * `insufficient_permission` regardless of what the test's
 * `EffectivePermissions` object claims. So the "successful note update" test
 * below needs a genuine actor. Same `auth.users` insert as
 * update-student-audit.test.ts's `makeUser`, plus the same direct
 * `user_effective_scopes` grant as packages/db/test/health-access.test.ts's
 * `grantScope` (a raw insert, not packages/db's private RLS harness, which
 * package-boundary lint forbids reaching into from an app).
 */
async function makeRealActor(email: string): Promise<{ authUserId: string; userId: string }> {
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
  await prisma.$executeRaw`
    insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
    values (${user.id}::uuid, 'health.write', 'global'::scope_type, null, now(), now())
  `
  return { authUserId, userId: user.id }
}

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.sensitiveAccessLog.deleteMany({ where: { entityId: id } })
    await prisma.studentHealthNote.deleteMany({ where: { studentId: id } })
    await prisma.studentHealth.deleteMany({ where: { studentId: id } })
    await prisma.student.deleteMany({ where: { id } })
  }
  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    await prisma.$executeRaw`delete from user_effective_scopes where user_id = (select id from app_users where auth_user_id = ${authUserId}::uuid)`
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
})

describe('getStudentHealthWithPermissions', () => {
  it('throws ForbiddenError without health.read', async () => {
    const student = await makeStudent()
    await expect(
      getStudentHealthWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, student.id),
    ).rejects.toThrow(ForbiddenError)
  })
})

describe('getStudentHealthNoteWithPermissions', () => {
  it('throws ForbiddenError without health_notes.read, even with health.read', async () => {
    // Core CLAUDE.md §3 invariant this task exists to prove: health.read and
    // health_notes.read are two independent gates. Holding one must never
    // imply the other.
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.read', scopeType: 'global', scopeId: null },
    ])
    await expect(
      getStudentHealthNoteWithPermissions(permissions, { authUserId: randomUUID() }, student.id),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError with no permissions at all', async () => {
    const student = await makeStudent()
    await expect(
      getStudentHealthNoteWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, student.id),
    ).rejects.toThrow(ForbiddenError)
  })
})

describe('updateStudentHealthWithPermissions', () => {
  it('throws ForbiddenError without health.write', async () => {
    const student = await makeStudent()
    await expect(
      updateStudentHealthWithPermissions(
        new EffectivePermissions([]),
        { authUserId: randomUUID() },
        student.id,
        { healthGroup: 'basic' },
      ),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates a student_health row on first write (upsert, no pre-existing row)', async () => {
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.write', scopeType: 'global', scopeId: null },
    ])

    await updateStudentHealthWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
      healthGroup: 'basic',
      peGroup: 'main',
      allergyCodes: ['горіхи'],
      chronicCodes: [],
      activityLimits: 'без бігу',
    })

    const created = await prisma.studentHealth.findUniqueOrThrow({ where: { studentId: student.id } })
    expect(created.healthGroup).toBe('basic')
    expect(created.peGroup).toBe('main')
    expect(created.allergyCodes).toEqual(['горіхи'])
    expect(created.chronicCodes).toEqual([])
    expect(created.activityLimits).toBe('без бігу')
  })

  it('leaves untouched fields as-is on a partial update (upsert path)', async () => {
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.write', scopeType: 'global', scopeId: null },
    ])

    await updateStudentHealthWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
      healthGroup: 'basic',
      peGroup: 'main',
      allergyCodes: ['горіхи'],
      chronicCodes: [],
    })

    await updateStudentHealthWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
      peGroup: 'prep',
    })

    const updated = await prisma.studentHealth.findUniqueOrThrow({ where: { studentId: student.id } })
    expect(updated.healthGroup).toBe('basic')
    expect(updated.peGroup).toBe('prep')
    expect(updated.allergyCodes).toEqual(['горіхи'])
  })

  it('rejects an invalid payload before touching the database', async () => {
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.write', scopeType: 'global', scopeId: null },
    ])

    await expect(
      updateStudentHealthWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
        healthGroup: '',
      }),
    ).rejects.toThrow()

    const row = await prisma.studentHealth.findUnique({ where: { studentId: student.id } })
    expect(row).toBeNull()
  })
})

describe('updateStudentHealthNoteWithPermissions', () => {
  it('throws ForbiddenError without health.write', async () => {
    const student = await makeStudent()
    await expect(
      updateStudentHealthNoteWithPermissions(
        new EffectivePermissions([]),
        { authUserId: randomUUID() },
        student.id,
        { content: 'Астма' },
      ),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws ForbiddenError for a caller holding only health.read, not health.write', async () => {
    // Reading structured data must not imply write access to the encrypted
    // note either.
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.read', scopeType: 'global', scopeId: null },
    ])
    await expect(
      updateStudentHealthNoteWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
        content: 'Астма',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('rejects content over the length limit before calling write_health_note', async () => {
    const student = await makeStudent()
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.write', scopeType: 'global', scopeId: null },
    ])

    await expect(
      updateStudentHealthNoteWithPermissions(permissions, { authUserId: randomUUID() }, student.id, {
        content: 'a'.repeat(5001),
      }),
    ).rejects.toThrow()

    const notes = await prisma.studentHealthNote.findMany({ where: { studentId: student.id } })
    expect(notes).toHaveLength(0)
  })

  it('writes the encrypted note through write_health_note and logs the access', async () => {
    const student = await makeStudent()
    const actor = await makeRealActor(`health-writer-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([
      { permissionCode: 'health.write', scopeType: 'global', scopeId: null },
    ])

    await updateStudentHealthNoteWithPermissions(permissions, { authUserId: actor.authUserId }, student.id, {
      content: 'Астма, інгалятор у медкабінеті',
    })

    // The `prisma` client here is the privileged connection (bypasses RLS
    // the same way updateStudentWithPermissions's writes do), so this
    // `findUniqueOrThrow` succeeds despite `student_health_notes_no_direct_read`
    // blocking plain-role SELECTs. Only the ciphertext's presence is checked
    // -- decrypting it would require `health_key()`, whose EXECUTE grant is
    // revoked from every role but the function owner, by design.
    const note = await prisma.studentHealthNote.findUniqueOrThrow({ where: { studentId: student.id } })
    expect(note.contentCipher.byteLength).toBeGreaterThan(0)
    expect(note.updatedBy).toBe(actor.userId)

    const logs = await prisma.sensitiveAccessLog.findMany({
      where: { userId: actor.userId, entityId: student.id, action: 'write' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.entityType).toBe('student_health_note')
  })
})
