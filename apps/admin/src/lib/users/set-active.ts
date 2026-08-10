import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, type EffectivePermissions } from '@starland/domain'

export const SetUserActiveInput = z.object({ isActive: z.boolean() })
export type SetUserActiveInput = z.infer<typeof SetUserActiveInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function setUserActiveWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'users.write')
  const { isActive } = SetUserActiveInput.parse(raw)

  if (!isActive && target.userId === actor.appUserId) {
    throw new ConflictError('Cannot deactivate your own account')
  }

  // Same set_config-without-set-local-role pattern as updateStudentWithPermissions:
  // the write runs on the privileged connection (app_users has no write RLS),
  // but claims are set transaction-locally so trg_write_audit_log_redacted
  // records the real actor instead of NULL.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.appUser.update({ where: { id: target.userId }, data: { isActive } })
  })
}
