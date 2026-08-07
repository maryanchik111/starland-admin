import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'
import { supabaseAdminAuthClient, type AdminAuthClient } from './supabase-admin-client'

export const CreateUserInput = z.object({
  fullName: z.string().trim().min(1, 'fullName must not be empty'),
  email: z.string().trim().toLowerCase().email('email must be valid'),
  roleCode: z.string().trim().min(1, 'roleCode must not be empty'),
  temporaryPassword: z.string().min(12, 'temporaryPassword must be at least 12 characters'),
})

export type CreateUserInput = z.infer<typeof CreateUserInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Ані Supabase Auth, ані `app_runtime`-транзакція не можуть відкотити одна
 * одну: справжньої атомарності між HTTP-викликом Admin API і Postgres-
 * транзакцією нема (див. Open Questions #1 у плані, вирішено 2026-08-07 —
 * компенсаційне видалення best-effort, без окремого job звірки).
 */
export async function createUserWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string; appUserId: string },
  raw: unknown,
  deps: { adminAuth: AdminAuthClient } = { adminAuth: supabaseAdminAuthClient() },
): Promise<{ id: string }> {
  requirePermission(permissions, 'users.write')
  const input = CreateUserInput.parse(raw)

  // Fail before calling the Admin API: an unknown role must never produce an
  // orphaned auth.users row with nothing to compensate against.
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } })
  if (!role) throw new NotFoundError('role', input.roleCode)

  const { userId: authUserId, errorMessage } = await deps.adminAuth.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true,
  })
  if (errorMessage || !authUserId) {
    throw new ConflictError(errorMessage ?? 'Supabase Admin API did not return a user id')
  }

  try {
    const appUser = await prisma.$transaction(async (tx) => {
      // Same pattern as updateStudentWithPermissions: privileged connection,
      // claims set transaction-locally so trg_write_audit_log_redacted
      // records the director as the actor instead of NULL.
      await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: actor.authUserId,
        role: 'authenticated',
      })}, true)`
      const created = await tx.appUser.create({
        data: { authUserId, fullName: input.fullName, email: input.email },
      })
      await tx.userRole.create({
        data: { userId: created.id, roleId: role.id, grantedBy: actor.appUserId },
      })
      return created
    })
    return { id: appUser.id }
  } catch (err) {
    const { errorMessage: deleteError } = await deps.adminAuth.deleteUser(authUserId)
    if (deleteError) {
      // Best-effort only (Open Questions #1) — no reconciliation job. This is
      // the one place we deliberately widen beyond "no console.log with PII":
      // authUserId is an identifier, not personal data, so it's fine to log.
      console.error('createUserWithPermissions: compensating deleteUser failed', {
        authUserId,
        deleteError,
      })
    }
    throw err
  }
}
