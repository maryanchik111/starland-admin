import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, NotFoundError, type EffectivePermissions } from '@starland/domain'

export const AddAwardInput = z.object({
  title: z.string().trim().min(1, 'title must not be empty'),
  awardedOn: z.string().date('awardedOn must be an ISO date (YYYY-MM-DD)'),
})

export type AddAwardInput = z.infer<typeof AddAwardInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * `{ employeeId }` (staff with no login — `/staff/[id]`) targets an
 * already-existing employee row directly. `{ userId }` keeps the
 * account-holder on-demand-create behavior: a staff member can add their
 * first award before ever filling in the rest of the profile card.
 * `employees` has no default for first_name/last_name (own identity, not
 * derived from app_users — see
 * docs/plans/2026-08-10-staff-and-status-model.md, Task 3), so that path
 * derives them from `app_users.full_name`.
 */
export async function addAwardWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { userId: string } | { employeeId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'staff.write')
  const input = AddAwardInput.parse(raw)

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`

    let employeeId: string
    if ('employeeId' in target) {
      employeeId = target.employeeId
    } else {
      let employee = await tx.employee.findUnique({ where: { userId: target.userId } })
      if (!employee) {
        const user = await tx.appUser.findUniqueOrThrow({ where: { id: target.userId } })
        const [firstName, ...rest] = user.fullName.split(' ')
        employee = await tx.employee.create({
          data: { userId: target.userId, firstName: firstName || user.fullName, lastName: rest.join(' ') || '—' },
        })
      }
      employeeId = employee.id
    }
    return tx.staffAward.create({
      data: { employeeId, title: input.title, awardedOn: new Date(input.awardedOn) },
    })
  })
  return { id: created.id }
}

export const RemoveAwardInput = z.object({
  awardId: z.string().uuid('awardId must be a valid UUID'),
})

export type RemoveAwardInput = z.infer<typeof RemoveAwardInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function removeAwardWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { userId: string } | { employeeId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'staff.write')
  const input = RemoveAwardInput.parse(raw)

  const award = await prisma.staffAward.findFirst({
    where: {
      id: input.awardId,
      deletedAt: null,
      employee: 'employeeId' in target ? { id: target.employeeId } : { userId: target.userId },
    },
  })
  if (!award) throw new NotFoundError('active staff award', input.awardId)

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.staffAward.update({ where: { id: award.id }, data: { deletedAt: new Date() } })
  })
}
