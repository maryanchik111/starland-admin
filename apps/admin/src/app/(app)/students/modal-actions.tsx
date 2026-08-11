'use server'

import { getStudentProfileData } from './[id]/student-profile-content'
import { getNewStudentData } from './new/new-student-content'

/**
 * Thin Server Action wrappers around the plain data-loaders — see
 * `apps/admin/src/app/(app)/users/modal-actions.tsx` for why this exists.
 */
export async function loadStudentProfileData(id: string) {
  return getStudentProfileData(id)
}

export async function loadNewStudentData() {
  return getNewStudentData()
}
