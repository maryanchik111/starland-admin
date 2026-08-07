import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const RevokeRoleInput = z.object({
  roleCode: z.string().trim().min(1, 'roleCode must not be empty'),
})

export type RevokeRoleInput = z.infer<typeof RevokeRoleInput>

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * The actual revoke logic, factored out so it can run inside a transaction
 * the caller already owns. `revokeRoleWithPermissions` below is the normal
 * entry point (opens its own transaction); tests that need to exercise the
 * "last active roles.manage holder" guard against the real, shared dev
 * database call this directly inside a transaction they roll back, so the
 * guard can be proven without permanently touching the real director account.
 */
export async function revokeRoleTx(
  tx: TxClient,
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'roles.manage')
  const input = RevokeRoleInput.parse(raw)

  const userRole = await tx.userRole.findFirst({
    where: { userId: target.userId, revokedAt: null, role: { code: input.roleCode } },
  })
  if (!userRole) throw new NotFoundError('active user role', `${target.userId}/${input.roleCode}`)

  // Guard: never let the system end up with zero active holders of
  // roles.manage globally — that would make it impossible for anyone to fix
  // access afterward. Checked generically against the permission this role
  // grants, not by hardcoding the role code "director".
  const rolesManageGlobal = await tx.rolePermission.findFirst({
    where: { roleId: userRole.roleId, scopeKind: 'global', permission: { code: 'roles.manage' } },
  })
  if (rolesManageGlobal) {
    const otherHolders = await tx.userRole.count({
      where: {
        id: { not: userRole.id },
        revokedAt: null,
        role: {
          rolePermissions: { some: { scopeKind: 'global', permission: { code: 'roles.manage' } } },
        },
      },
    })
    if (otherHolders === 0) {
      throw new ConflictError('Cannot revoke the last active holder of roles.manage in the system')
    }
  }

  await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
    sub: actor.authUserId,
    role: 'authenticated',
  })}, true)`
  await tx.userRole.update({
    where: { id: userRole.id },
    data: { revokedAt: new Date(), revokedBy: actor.appUserId },
  })
}

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function revokeRoleWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<void> {
  await prisma.$transaction((tx) => revokeRoleTx(tx, permissions, actor, target, raw))
}
