import { z } from 'zod'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

const Query = z.string().trim().min(2, 'query must be at least 2 characters')

export interface GuardianPersonSearchClient {
  findMany(args: {
    where: {
      deletedAt: null
      OR: Array<
        | { firstName: { contains: string; mode: 'insensitive' } }
        | { lastName: { contains: string; mode: 'insensitive' } }
        | { phone: { contains: string } }
      >
    }
    take: number
  }): Promise<Array<{ id: string; firstName: string; lastName: string; phone: string | null }>>
}

export interface GuardianPersonResult {
  id: string
  name: string
  phone: string | null
}

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * Runs through the privileged connection (see the actual server action,
 * which passes `prisma.guardianPerson` rather than an RLS-scoped one):
 * `guardian_persons_read` only allows a viewer to see people already linked
 * to a student they can see, but "link an existing guardian to a different
 * student" — the whole point of this search — needs to find people outside
 * that set too. `requirePermission` against the class being managed is the
 * actual authorization gate here, not RLS.
 */
export async function searchGuardiansWithPermissions(
  permissions: EffectivePermissions,
  client: GuardianPersonSearchClient,
  classId: string,
  rawQuery: string,
): Promise<GuardianPersonResult[]> {
  requirePermission(permissions, 'students.write', { type: 'class', id: classId })
  const query = Query.parse(rawQuery)

  const people = await client.findMany({
    where: {
      deletedAt: null,
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ],
    },
    take: 10,
  })

  return people.map((p) => ({ id: p.id, name: `${p.lastName} ${p.firstName}`, phone: p.phone }))
}
