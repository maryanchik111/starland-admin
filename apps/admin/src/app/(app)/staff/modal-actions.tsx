'use server'

import { getStaffProfileData } from './[id]/staff-profile-content'
import { getNewEmployeeData } from './new/new-employee-content'

/**
 * Thin Server Action wrappers around the plain data-loaders — see
 * `apps/admin/src/app/(app)/users/modal-actions.tsx` for why this exists.
 * `loadStaffProfileData` can resolve to either the `{ view: 'staff' }`
 * profile or, when the employee is linked to a login account, the person's
 * `{ view: 'user' }` profile instead — `PersonModalProvider` picks the
 * right rendering component based on `view`.
 */
export async function loadStaffProfileData(id: string) {
  return getStaffProfileData(id)
}

export async function loadNewEmployeeData() {
  return getNewEmployeeData()
}
