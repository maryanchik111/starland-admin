import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

export const CreateEmployeeInput = z.object({
  firstName: z.string().trim().min(1, 'firstName must not be empty'),
  lastName: z.string().trim().min(1, 'lastName must not be empty'),
  middleName: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  positionCode: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  experienceYears: z.number().int().min(0).optional(),
  hiredOn: z.string().date('hiredOn must be an ISO date (YYYY-MM-DD)').optional(),
})

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Unlike `updateStaffProfileWithPermissions` (always targets an existing
 * `app_users` row via `userId`), this is the path for staff who never get a
 * system login — security, kitchen, cleaning (CLAUDE.md decision: `Employee`
 * has its own identity, independent of `AppUser`, same as `GuardianPerson` —
 * see docs/plans/2026-08-10-staff-and-status-model.md, Task 3). There is
 * deliberately no `userId` here; linking an existing account to an employee
 * record is `updateStaffProfileWithPermissions`'s job, not this one's.
 */
export async function createEmployeeWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'staff.write')
  const input = CreateEmployeeInput.parse(raw)

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    return tx.employee.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        phone: input.phone,
        positionCode: input.positionCode,
        category: input.category,
        experienceYears: input.experienceYears,
        hiredOn: input.hiredOn ? new Date(input.hiredOn) : undefined,
      },
    })
  })
  return { id: created.id }
}
