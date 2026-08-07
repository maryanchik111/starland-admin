'use server'

import { requireSession } from '@/lib/session'
import { createUserWithPermissions } from '@/lib/users/create-user'

export async function createUser(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createUserWithPermissions(
    session.permissions,
    { authUserId: session.authUserId, appUserId: session.appUserId },
    raw,
  )
}
