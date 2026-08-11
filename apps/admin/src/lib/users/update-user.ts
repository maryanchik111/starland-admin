import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

export const UpdateUserInput = z.object({ fullName: z.string().trim().min(1, 'fullName must not be empty') })
export type UpdateUserInput = z.infer<typeof UpdateUserInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * `email` is deliberately NOT editable here: it's the Supabase Auth login
 * credential, set through the Admin API at `createUserWithPermissions` time
 * — changing `app_users.email` in isolation would desync the profile from
 * what the person actually logs in with. Renaming a user's login email
 * needs its own Admin API call and is a separate change, not folded in here.
 */
export async function updateUserWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { userId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'users.write')
  const { fullName } = UpdateUserInput.parse(raw)

  // Same set_config-without-set-local-role pattern as setUserActiveWithPermissions:
  // the write runs on the privileged connection, but claims are set
  // transaction-locally so trg_write_audit_log_redacted records the real
  // actor instead of NULL.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.appUser.update({ where: { id: target.userId }, data: { fullName } })
  })
}
