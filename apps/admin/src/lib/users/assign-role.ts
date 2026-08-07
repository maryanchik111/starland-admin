import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const AssignRoleInput = z.object({
  roleCode: z.string().trim().min(1, 'roleCode must not be empty'),
})

export type AssignRoleInput = z.infer<typeof AssignRoleInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function assignRoleWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'roles.manage')
  const input = AssignRoleInput.parse(raw)

  const role = await prisma.role.findUnique({ where: { code: input.roleCode } })
  if (!role) throw new NotFoundError('role', input.roleCode)

  // Checked ahead of the insert (rather than relying on the partial unique
  // index to reject it) so the caller gets a typed ConflictError instead of
  // a raw Postgres constraint violation.
  const existingActive = await prisma.userRole.findFirst({
    where: { userId: target.userId, roleId: role.id, revokedAt: null },
  })
  if (existingActive) {
    throw new ConflictError(`User already has an active assignment of role ${input.roleCode}`)
  }

  const created = await prisma.$transaction(async (tx) => {
    // Same claims-setting pattern as updateStudentWithPermissions: the write
    // runs on the privileged connection, but trg_write_audit_log records the
    // director as the actor by way of current_app_user_id().
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.userRole.create({
      data: { userId: target.userId, roleId: role.id, grantedBy: actor.appUserId },
    })
  })
  return { id: created.id }
}
