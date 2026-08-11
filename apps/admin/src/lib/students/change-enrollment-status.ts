import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const ChangeEnrollmentStatusInput = z.object({
  status: z.enum(['withdrawn', 'graduated', 'expelled', 'academic_leave']),
  reason: z.string().trim().min(10, 'reason must be at least 10 characters'),
  orderId: z.string().uuid('orderId must be a valid UUID').optional(),
})

export type ChangeEnrollmentStatusInput = z.infer<typeof ChangeEnrollmentStatusInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Unlike `assignClassWithPermissions` (in-school class change, always opens
 * a replacement enrollment), this closes the active enrollment and creates
 * nothing new — the student has no active class after withdrawal/graduation/
 * exclusion/academic leave. See
 * docs/plans/2026-08-10-staff-and-status-model.md, Task 4.
 */
export async function changeEnrollmentStatusWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { studentId: string },
  raw: unknown,
): Promise<{ id: string }> {
  const input = ChangeEnrollmentStatusInput.parse(raw)

  // The target class isn't caller-supplied here (unlike assignClass), so it
  // has to be resolved before the scope check can run at all.
  const currentActive = await prisma.enrollment.findFirst({
    where: { studentId: target.studentId, toDate: null },
  })
  if (!currentActive) throw new NotFoundError('active enrollment', target.studentId)

  requirePermission(permissions, 'students.write', { type: 'class', id: currentActive.classId })

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.enrollment.update({
      where: { id: currentActive.id },
      data: {
        toDate: new Date(),
        statusKind: input.status,
        reason: input.reason,
        statusOrderId: input.orderId,
      },
    })
  })
  return { id: updated.id }
}
