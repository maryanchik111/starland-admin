import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const AssignTeachingInput = z.object({
  subjectId: z.string().uuid('subjectId must be a valid UUID'),
  classId: z.string().uuid('classId must be a valid UUID'),
  periodId: z.string().uuid('periodId must be a valid UUID'),
})

export type AssignTeachingInput = z.infer<typeof AssignTeachingInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function assignTeachingWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { teacherUserId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'staff.write')
  const input = AssignTeachingInput.parse(raw)

  const [subject, cls, period] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.class.findUnique({ where: { id: input.classId } }),
    prisma.academicPeriod.findUnique({ where: { id: input.periodId } }),
  ])
  if (!subject) throw new NotFoundError('subject', input.subjectId)
  if (!cls) throw new NotFoundError('class', input.classId)
  if (!period) throw new NotFoundError('academic period', input.periodId)

  // Checked ahead of the insert (rather than relying on the partial unique
  // index to reject it) so the caller gets a typed ConflictError instead of
  // a raw Postgres constraint violation — same precedent as assignRole.
  const existingActive = await prisma.teachingAssignment.findFirst({
    where: {
      teacherUserId: target.teacherUserId,
      subjectId: input.subjectId,
      classId: input.classId,
      periodId: input.periodId,
      deletedAt: null,
    },
  })
  if (existingActive) {
    throw new ConflictError('Teacher already has this subject+class+period assignment')
  }

  const created = await prisma.$transaction(async (tx) => {
    // Same claims-setting pattern as assignRoleWithPermissions: the write
    // runs on the privileged connection, but trg_write_audit_log records the
    // director as the actor by way of current_app_user_id().
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.teachingAssignment.create({
      data: {
        teacherUserId: target.teacherUserId,
        subjectId: input.subjectId,
        classId: input.classId,
        periodId: input.periodId,
      },
    })
  })
  return { id: created.id }
}

export const RevokeTeachingInput = z.object({
  assignmentId: z.string().uuid('assignmentId must be a valid UUID'),
})

export type RevokeTeachingInput = z.infer<typeof RevokeTeachingInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function revokeTeachingWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { teacherUserId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'staff.write')
  const input = RevokeTeachingInput.parse(raw)

  const assignment = await prisma.teachingAssignment.findFirst({
    where: { id: input.assignmentId, teacherUserId: target.teacherUserId, deletedAt: null },
  })
  if (!assignment) throw new NotFoundError('active teaching assignment', input.assignmentId)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.teachingAssignment.update({
      where: { id: assignment.id },
      data: { deletedAt: new Date() },
    })
  })
}
