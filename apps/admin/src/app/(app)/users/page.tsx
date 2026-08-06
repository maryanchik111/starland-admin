import { redirect } from 'next/navigation'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UsersTable } from './users-table'
import type { UserRow } from './columns'

const DEFAULT_PAGE_SIZE = 20

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  // Direct-URL guard: the nav item is already hidden without `users.read`,
  // but a permission check belongs on the page too, not only in the nav —
  // an element without permission never renders, it does not rely on the
  // caller not knowing the URL.
  if (!session.permissions.can('users.read')) redirect('/')

  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE)

  // Query goes through withUserContext so RLS actually applies — visibility
  // of every row here depends on the `app_users_read_all` / `user_roles_read_all`
  // policies added alongside this page (see
  // packages/db/prisma/migrations/20260807120000_users_read_policy).
  const { users, rolesByUserId, totalCount } = await withUserContext(session.authUserId, async (tx) => {
    const where = q
      ? { deletedAt: null, OR: [{ fullName: { contains: q, mode: 'insensitive' as const } },
                                 { email: { contains: q, mode: 'insensitive' as const } }] }
      : { deletedAt: null }
    const [users, totalCount] = await Promise.all([
      tx.appUser.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.appUser.count({ where }),
    ])
    const userIds = users.map((u) => u.id)
    const userRoles = userIds.length
      ? await tx.userRole.findMany({
          where: { userId: { in: userIds } },
          include: { role: true },
        })
      : []
    const rolesByUserId = new Map<string, string[]>()
    for (const ur of userRoles) {
      const names = rolesByUserId.get(ur.userId) ?? []
      names.push(ur.role.name)
      rolesByUserId.set(ur.userId, names)
    }
    return { users, rolesByUserId, totalCount }
  })

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    roles: rolesByUserId.get(u.id) ?? [],
    isActive: u.isActive,
  }))

  return (
    <main className='p-6'>
      <Card>
        <CardHeader>
          <CardTitle>{uk.users.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersTable
            data={rows}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            searchParams={params}
          />
        </CardContent>
      </Card>
    </main>
  )
}
