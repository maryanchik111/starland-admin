'use server'

import { withUserContext } from '@starland/db'
import { requireSession } from '@/lib/session'
import { searchPeopleWithPermissions, type PersonResult } from '@/lib/search-people.js'

export async function searchPeople(query: string): Promise<PersonResult[]> {
  const session = await requireSession()
  return withUserContext(session.authUserId, (tx) =>
    searchPeopleWithPermissions(session.permissions, tx.student, query),
  )
}
