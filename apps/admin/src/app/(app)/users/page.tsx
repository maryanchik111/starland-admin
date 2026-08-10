import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { UsersTable } from './users-table'
import type { UserRow } from './columns'

const DEFAULT_PAGE_SIZE = 20

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  if (!session.permissions.can('users.read')) redirect('/')

  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE)

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

  const headerActions = session.permissions.can('users.write') && (
    <Button asChild size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
      <Link href="/users/new">
        <Plus className="size-4" /> {uk.users.newUser}
      </Link>
    </Button>
  )

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        title={uk.users.title}
        actions={headerActions}
      />
      <UsersTable
        data={rows}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        searchParams={params}
      />
    </div>
  )
}
