'use server'

import { z } from 'zod'
import { ConflictError, NotFoundError } from '@starland/domain'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { createUserWithPermissions } from '@/lib/users/create-user'
import { assignRoleWithPermissions } from '@/lib/users/assign-role'
import { revokeRoleWithPermissions } from '@/lib/users/revoke-role'
import { setUserActiveWithPermissions } from '@/lib/users/set-active'
import { assignTeachingWithPermissions, revokeTeachingWithPermissions } from '@/lib/staff/assign-teaching'
import { grantPermissionWithPermissions, revokePermissionGrantWithPermissions } from '@/lib/users/grant-permission'
import { updateStaffProfileWithPermissions } from '@/lib/staff/update-staff-profile'
import { updateUserWithPermissions } from '@/lib/users/update-user'
import { addAwardWithPermissions, removeAwardWithPermissions } from '@/lib/staff/manage-awards'

export async function createUser(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createUserWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    raw,
  )
}

type SubmitResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; message: string }

/**
 * Error-mapped wrapper around `createUser`, called directly from
 * `NewUserView` (a Client Component) — moved out of an inline `'use server'`
 * closure in `new-user-content.tsx` because that file no longer renders
 * anything (see the comment atop `user-profile-content.tsx` for why).
 */
export async function submitCreateUser(raw: unknown): Promise<SubmitResult<{ id: string }>> {
  try {
    const { id } = await createUser(raw)
    return { ok: true, id }
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.users.createError }
    if (err instanceof ConflictError) return { ok: false, message: uk.users.duplicateEmail }
    if (err instanceof NotFoundError) return { ok: false, message: uk.users.unknownRole }
    return { ok: false, message: uk.users.createError }
  }
}

export async function assignRole(userId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return assignRoleWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    { userId },
    raw,
  )
}

export async function revokeRole(userId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await revokeRoleWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    { userId },
    raw,
  )
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const session = await requireSession()
  await setUserActiveWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    { userId },
    { isActive },
  )
}

export async function assignTeaching(teacherUserId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return assignTeachingWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { teacherUserId },
    raw,
  )
}

export async function revokeTeaching(teacherUserId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await revokeTeachingWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { teacherUserId },
    raw,
  )
}

export async function grantPermission(userId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return grantPermissionWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    { userId },
    raw,
  )
}

export async function revokePermissionGrant(userId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await revokePermissionGrantWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    { userId },
    raw,
  )
}

export async function updateUser(userId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await updateUserWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { userId },
    raw,
  )
}

export async function updateStaffProfile(userId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return updateStaffProfileWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { userId },
    raw,
  )
}

export async function addAward(userId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return addAwardWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { userId },
    raw,
  )
}

export async function removeAward(userId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await removeAwardWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { userId },
    raw,
  )
}
