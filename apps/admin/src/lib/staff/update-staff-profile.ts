import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

export const UpdateStaffProfileInput = z.object({
  phone: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  experienceYears: z.number().int().min(0).optional(),
  positionCode: z.string().trim().min(1).optional(),
  employmentStatus: z
    .enum(['working', 'vacation', 'sick_leave', 'maternity_leave', 'unpaid_leave', 'dismissed'])
    .optional(),
})

export type UpdateStaffProfileInput = z.infer<typeof UpdateStaffProfileInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * `employees.user_id` is a genuine (non-partial) unique constraint — unlike
 * roles/teaching assignments, an employee row is never re-created after
 * being soft-deleted, so a plain upsert is safe here without the
 * partial-unique-index concern that applied to those.
 *
 * `first_name`/`last_name` are NOT NULL on `employees` (it has its own
 * identity, independent of `app_users` — see
 * docs/plans/2026-08-10-staff-and-status-model.md, Task 3), so a first-time
 * create for a user-linked employee derives them from `app_users.full_name`.
 *
 * Two target shapes: `{ userId }` is the account-holder path above
 * (auto-creates the employee row on first save, deriving the name).
 * `{ employeeId }` is for staff with no login (security, kitchen, cleaning —
 * `/staff/[id]`) — the employee row already exists (created via
 * `createEmployeeWithPermissions`, which is the only place that creates one
 * without a `userId`), so this path only ever updates, never creates.
 */
export async function updateStaffProfileWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { userId: string } | { employeeId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'staff.write')
  const input = UpdateStaffProfileInput.parse(raw)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`

    if ('employeeId' in target) {
      return tx.employee.update({ where: { id: target.employeeId }, data: input })
    }

    const existing = await tx.employee.findUnique({ where: { userId: target.userId } })
    if (existing) {
      return tx.employee.update({ where: { userId: target.userId }, data: input })
    }

    const user = await tx.appUser.findUniqueOrThrow({ where: { id: target.userId } })
    const [firstName, ...rest] = user.fullName.split(' ')
    return tx.employee.create({
      data: {
        userId: target.userId,
        firstName: firstName || user.fullName,
        lastName: rest.join(' ') || '—',
        ...input,
      },
    })
  })
  return { id: updated.id }
}
