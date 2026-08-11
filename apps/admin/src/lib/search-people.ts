import { z } from 'zod'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

const Query = z.string().trim().min(2, 'query must be at least 2 characters')

export interface StudentSearchClient {
  findMany(args: {
    where: {
      OR: Array<
        | { firstName: { contains: string; mode: 'insensitive' } }
        | { lastName: { contains: string; mode: 'insensitive' } }
      >
    }
    take: number
  }): Promise<Array<{ id: string; firstName: string; lastName: string }>>
}

export interface PersonResult {
  id: string
  name: string
}

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function searchPeopleWithPermissions(
  permissions: EffectivePermissions,
  studentClient: StudentSearchClient,
  rawQuery: string,
): Promise<PersonResult[]> {
  requirePermission(permissions, 'students.read')
  const query = Query.parse(rawQuery)

  const students = await studentClient.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 10,
  })

  return students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}` }))
}
