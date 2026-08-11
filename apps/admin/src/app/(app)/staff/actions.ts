'use server'

import { requireSession } from '@/lib/session'
import { createEmployeeWithPermissions } from '@/lib/staff/create-employee'
import { updateStaffProfileWithPermissions } from '@/lib/staff/update-staff-profile'
import { addAwardWithPermissions, removeAwardWithPermissions } from '@/lib/staff/manage-awards'

export async function createEmployee(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createEmployeeWithPermissions(session.permissions, { authUserId: session.authUserId }, raw)
}

// Targeted by `employeeId`, not `userId` — for `/staff/[id]`, the profile
// of a staff member with no login account (see
// docs/plans/2026-08-10-unified-profile-modals.md, Task 7). The
// account-holder path (`/users/[id]`) keeps using
// `apps/admin/src/app/(app)/users/actions.ts`'s `updateStaffProfile`/
// `addAward`/`removeAward`, which target `{ userId }`.
export async function updateEmployeeProfile(employeeId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return updateStaffProfileWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { employeeId },
    raw,
  )
}

export async function addEmployeeAward(employeeId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return addAwardWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { employeeId },
    raw,
  )
}

export async function removeEmployeeAward(employeeId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await removeAwardWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { employeeId },
    raw,
  )
}
