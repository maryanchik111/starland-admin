import { prisma } from '@starland/db'
import { requirePermission, NotFoundError, type EffectivePermissions } from '@starland/domain'

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Soft-unlink only (`deletedAt`), never `DELETE` — the guardianship row
 * itself is the historical record of who was ever responsible for a
 * student.
 */
export async function unlinkGuardianWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { classId: string },
  guardianshipId: string,
): Promise<void> {
  requirePermission(permissions, 'students.write', { type: 'class', id: target.classId })

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    const result = await tx.guardianship.updateMany({
      where: { id: guardianshipId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    if (result.count === 0) throw new NotFoundError('guardianship', guardianshipId)
  })
}
