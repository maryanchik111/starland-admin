import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'
import { CreateStudentInput } from './create-student-schema'

export { CreateStudentInput }

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Global scope only: a brand-new student has no class yet, so there is no
 * `{type: 'class', id}` to check `students.write` against — the caller must
 * hold the permission unscoped.
 */
export async function createStudentWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'students.write')
  const input = CreateStudentInput.parse(raw)

  // Same set_config-without-set-local-role pattern as updateStudentWithPermissions:
  // students has no INSERT RLS policy, so this write goes through the
  // privileged connection, but claims are set transaction-locally so
  // trg_write_audit_log_redacted records the real actor instead of NULL.
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.student.create({ data: input })
  })
  return { id: created.id }
}
