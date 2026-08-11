import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const AssignClassInput = z.object({
  classId: z.string().uuid('classId must be a valid UUID'),
})

export type AssignClassInput = z.infer<typeof AssignClassInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * A class change is never an UPDATE of `classId` on the live row: the
 * current active enrollment (`toDate = null`) is closed (`toDate = now()`)
 * and a fresh row is created for the new class, so the transition history
 * stays readable — "who was in which class when" must survive a reassignment.
 */
export async function assignClassWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { studentId: string },
  raw: unknown,
): Promise<{ id: string }> {
  const input = AssignClassInput.parse(raw)
  // Permission is checked against the target class, not the student's
  // current one: a student has no class yet at first assignment, and the
  // right being exercised is "can place a student into this class."
  requirePermission(permissions, 'students.write', { type: 'class', id: input.classId })

  const cls = await prisma.class.findUnique({ where: { id: input.classId } })
  if (!cls) throw new NotFoundError('class', input.classId)

  const currentActive = await prisma.enrollment.findFirst({
    where: { studentId: target.studentId, toDate: null },
  })
  if (currentActive?.classId === input.classId) {
    throw new ConflictError('Student is already enrolled in this class')
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    const now = new Date()
    if (currentActive) {
      // Closed because of an in-school class change, not a withdrawal —
      // withdrawn/graduated/expelled/academic_leave go through
      // changeEnrollmentStatusWithPermissions instead, which never creates a
      // replacement row.
      await tx.enrollment.update({
        where: { id: currentActive.id },
        data: { toDate: now, statusKind: 'transferred_internal' },
      })
    }
    return tx.enrollment.create({
      data: { studentId: target.studentId, classId: input.classId, fromDate: now, statusKind: 'active' },
    })
  })
  return { id: created.id }
}
