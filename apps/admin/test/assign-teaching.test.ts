import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { assignTeachingWithPermissions, revokeTeachingWithPermissions } from '../src/lib/staff/assign-teaching.js'

const createdAssignmentIds: string[] = []
const createdSubjectIds: string[] = []
const createdYearIds: string[] = []
const createdAuthUserIds: string[] = []

async function makeAppUser(email: string): Promise<{ authUserId: string; appUserId: string }> {
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
  return { authUserId, appUserId: user.id }
}

async function makeFixture() {
  const suffix = randomUUID().slice(0, 8)
  const year = await prisma.academicYear.create({
    data: {
      name: `Y-teaching-${suffix}`,
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2027-06-30'),
    },
  })
  createdYearIds.push(year.id)
  const cls = await prisma.class.create({
    data: { academicYearId: year.id, gradeLevel: 5, name: `5-Т-${suffix}` },
  })
  const period = await prisma.academicPeriod.create({
    data: { academicYearId: year.id, name: `Семестр-${suffix}`, ordinal: 1, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-01-15') },
  })
  const subject = await prisma.subject.create({ data: { code: `subj-${suffix}`, name: `Предмет ${suffix}` } })
  createdSubjectIds.push(subject.id)
  return { cls, period, subject }
}

const globalStaffWrite = new EffectivePermissions([
  { permissionCode: 'staff.write', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdAssignmentIds.length > 0) {
    const id = createdAssignmentIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'teaching_assignments', entityId: id } })
    await prisma.teachingAssignment.deleteMany({ where: { id } })
  }
  while (createdAuthUserIds.length > 0) {
    const authUserId = createdAuthUserIds.pop()
    if (!authUserId) continue
    await prisma.appUser.deleteMany({ where: { authUserId } })
    await prisma.$executeRaw`delete from auth.users where id = ${authUserId}::uuid`
  }
  while (createdSubjectIds.length > 0) {
    const id = createdSubjectIds.pop()
    if (!id) continue
    await prisma.subject.deleteMany({ where: { id } })
  }
  while (createdYearIds.length > 0) {
    const yearId = createdYearIds.pop()
    if (!yearId) continue
    await prisma.class.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicYear.deleteMany({ where: { id: yearId } })
  }
})

describe('assignTeachingWithPermissions', () => {
  it('throws ForbiddenError without staff.write', async () => {
    const { cls, period, subject } = await makeFixture()
    await expect(
      assignTeachingWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { teacherUserId: randomUUID() }, {
        subjectId: subject.id,
        classId: cls.id,
        periodId: period.id,
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError for an unknown subject', async () => {
    const { cls, period } = await makeFixture()
    await expect(
      assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId: randomUUID() }, {
        subjectId: randomUUID(),
        classId: cls.id,
        periodId: period.id,
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('creates the assignment and returns its id', async () => {
    const { cls, period, subject } = await makeFixture()
    const teacherUserId = randomUUID()

    const result = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(result.id)

    const created = await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: result.id } })
    expect(created.teacherUserId).toBe(teacherUserId)
    expect(created.deletedAt).toBeNull()
  })

  it('throws ConflictError when the same active assignment already exists', async () => {
    const { cls, period, subject } = await makeFixture()
    const teacherUserId = randomUUID()
    const first = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(first.id)

    await expect(
      assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
        subjectId: subject.id,
        classId: cls.id,
        periodId: period.id,
      }),
    ).rejects.toThrow(ConflictError)
  })

  it('allows re-assigning the same subject+class+period after the prior one was revoked', async () => {
    const { cls, period, subject } = await makeFixture()
    const teacherUserId = randomUUID()
    const first = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(first.id)
    await revokeTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      assignmentId: first.id,
    })

    const second = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(second.id)
    expect(second.id).not.toBe(first.id)
  })

  it('records an audit log entry with the acting user, since this is a scope change (CLAUDE.md §3)', async () => {
    const { cls, period, subject } = await makeFixture()
    const actor = await makeAppUser(`teaching-audit-${randomUUID()}@admin-starland.test`)
    const teacherUserId = randomUUID()

    const created = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: actor.authUserId }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(created.id)

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'teaching_assignments', entityId: created.id, action: 'INSERT' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.appUserId)
    // teaching_assignments holds no personal data, so it uses the plain
    // (non-redacted) trigger — the row is fully readable, not '[REDACTED]'.
    expect((logs[0]?.newValues as { teacher_user_id?: string } | null)?.teacher_user_id).toBe(teacherUserId)
  })
})

describe('revokeTeachingWithPermissions', () => {
  it('throws ForbiddenError without staff.write', async () => {
    const { cls, period, subject } = await makeFixture()
    const teacherUserId = randomUUID()
    const created = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(created.id)

    await expect(
      revokeTeachingWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { teacherUserId }, {
        assignmentId: created.id,
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError for an unknown assignment', async () => {
    await expect(
      revokeTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId: randomUUID() }, {
        assignmentId: randomUUID(),
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('soft-deletes the assignment', async () => {
    const { cls, period, subject } = await makeFixture()
    const teacherUserId = randomUUID()
    const created = await assignTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      subjectId: subject.id,
      classId: cls.id,
      periodId: period.id,
    })
    createdAssignmentIds.push(created.id)

    await revokeTeachingWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { teacherUserId }, {
      assignmentId: created.id,
    })

    const revoked = await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: created.id } })
    expect(revoked.deletedAt).not.toBeNull()
  })
})
