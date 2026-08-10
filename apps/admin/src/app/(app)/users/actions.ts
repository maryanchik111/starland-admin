'use server'

import { requireSession } from '@/lib/session'
import { createUserWithPermissions } from '@/lib/users/create-user'
import { assignRoleWithPermissions } from '@/lib/users/assign-role'
import { revokeRoleWithPermissions } from '@/lib/users/revoke-role'
import { setUserActiveWithPermissions } from '@/lib/users/set-active'

export async function createUser(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createUserWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    raw,
  )
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
