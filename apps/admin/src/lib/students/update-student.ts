import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'
import { UpdateStudentInput } from './update-student-schema'

export { UpdateStudentInput }

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function updateStudentWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  student: { id: string; classId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'students.write', { type: 'class', id: student.classId })
  const input = UpdateStudentInput.parse(raw)

  // The write itself has to go through the privileged connection: this schema
  // has no INSERT/UPDATE RLS policies at all (see
  // docs/adr/0001-prisma-with-supabase-rls.md), so the domain layer above is
  // the authorization gate and `app_runtime` has no path that would succeed.
  //
  // But `trg_write_audit_log_redacted` stamps the actor with
  // `current_app_user_id()`, which reads `auth.uid()`, which reads
  // `request.jwt.claims` — a value the privileged connection never sets. Every
  // student edit was therefore audited with `user_id = NULL`: "something
  // changed, nobody knows who", which CLAUDE.md §3 forbids.
  //
  // So we set the same claims `withUserContext` sets, transaction-locally
  // (`set_config(..., true)` resets at commit/rollback), but WITHOUT
  // `set local role authenticated`. Keeping the privileged role means RLS is
  // still bypassed for the write; setting the claims means the trigger sees
  // the real actor.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    // Same rule as createStudentWithPermissions: `parentalConsentEnteredBy`
    // is never accepted from the request body (not in UpdateStudentInput at
    // all) — it's the acting director/staff member, resolved from their own
    // session, not a client-supplied value. Only reassigned when the
    // consent date actually changes — the inline edit form always resends
    // every field, so a save that only touches e.g. the address must not
    // silently overwrite who recorded the consent.
    let parentalConsentEnteredBy: string | undefined
    if (input.parentalConsentGivenAt) {
      const existing = await tx.student.findUniqueOrThrow({
        where: { id: student.id },
        select: { parentalConsentGivenAt: true },
      })
      const changed = existing.parentalConsentGivenAt?.getTime() !== input.parentalConsentGivenAt.getTime()
      if (changed) {
        parentalConsentEnteredBy = (await tx.appUser.findUniqueOrThrow({ where: { authUserId: actor.authUserId } })).id
      }
    }
    await tx.student.update({ where: { id: student.id }, data: { ...input, parentalConsentEnteredBy } })
  })
}
