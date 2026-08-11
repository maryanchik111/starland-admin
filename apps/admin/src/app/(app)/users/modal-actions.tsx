'use server'

import { getUserProfileData } from './[id]/user-profile-content'
import { getNewUserData } from './new/new-user-content'

/**
 * Thin Server Action wrappers around the plain data-loaders — this is what
 * `PersonModalProvider` actually calls. Returns data, never JSX (see the
 * comment atop `[id]/user-profile-content.tsx` for why).
 */
export async function loadUserProfileData(id: string) {
  return getUserProfileData(id)
}

export async function loadNewUserData() {
  return getNewUserData()
}
