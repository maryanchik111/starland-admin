import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const GrantPermissionInput = z.object({
  permissionCode: z.string().trim().min(1, 'permissionCode must not be empty'),
  reason: z.string().trim().min(10, 'reason must be at least 10 characters'),
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be an ISO date' })
    .optional()
    .refine((v) => !v || new Date(v) > new Date(), 'expiresAt must be in the future'),
})

export type GrantPermissionInput = z.infer<typeof GrantPermissionInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * V1 only issues global-scope `allow` grants: a class/subject/student-scoped
 * grant needs a generic entity picker that doesn't exist anywhere in the
 * admin yet (see docs/plans/2026-08-10-user-profile-full-data.md, Task 4's
 * TODO(question)). `deny` grants are also out of scope here — issuing one
 * through this form would be a silent, hard-to-audit way to strip access,
 * which is the opposite of what this screen is for.
 */
export async function grantPermissionWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'roles.manage')
  const input = GrantPermissionInput.parse(raw)

  const permission = await prisma.permission.findUnique({ where: { code: input.permissionCode } })
  if (!permission) throw new NotFoundError('permission', input.permissionCode)

  const created = await prisma.$transaction(async (tx) => {
    // Same claims-setting pattern as assignRoleWithPermissions: the write
    // runs on the privileged connection, but trg_write_audit_log records the
    // director as the actor by way of current_app_user_id().
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.permissionGrant.create({
      data: {
        userId: target.userId,
        permissionId: permission.id,
        effect: 'allow',
        scopeType: 'global',
        scopeId: null,
        reason: input.reason,
        grantedBy: actor.appUserId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    })
  })
  return { id: created.id }
}

export const RevokePermissionGrantInput = z.object({
  grantId: z.string().uuid('grantId must be a valid UUID'),
})

export type RevokePermissionGrantInput = z.infer<typeof RevokePermissionGrantInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function revokePermissionGrantWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'roles.manage')
  const input = RevokePermissionGrantInput.parse(raw)

  const grant = await prisma.permissionGrant.findFirst({
    where: { id: input.grantId, userId: target.userId, revokedAt: null },
  })
  if (!grant) throw new NotFoundError('active permission grant', input.grantId)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.permissionGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), revokedBy: actor.appUserId },
    })
  })
}
