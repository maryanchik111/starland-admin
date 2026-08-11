'use server'

import { ConflictError } from '@starland/domain'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { setUserActiveWithPermissions } from '@/lib/users/set-active'

type ActionResult = { ok: true } | { ok: false; message: string }

/**
 * Same domain call and error mapping as the profile page's inline
 * `submitSetActive`, exposed as its own action so the users list row can
 * toggle status without a page navigation.
 */
export async function setUserActiveFromList(userId: string, isActive: boolean): Promise<ActionResult> {
  const session = await requireSession()
  try {
    await setUserActiveWithPermissions(
      session.permissions,
      { authUserId: session.authUserId, appUserId: session.appUserId },
      { userId },
      { isActive },
    )
    return { ok: true }
  } catch (err) {
    if (err instanceof ConflictError) return { ok: false, message: uk.users.cannotDeactivateSelf }
    return { ok: false, message: isActive ? uk.users.reactivateError : uk.users.deactivateError }
  }
}
