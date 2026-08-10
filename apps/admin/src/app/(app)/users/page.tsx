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

const SORTABLE_FIELDS = {
  fullName: 'fullName',
  email: 'email',
  status: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
} as const
type SortField = keyof typeof SORTABLE_FIELDS

function parseSort(params: Record<string, string | string[] | undefined>) {
  const sort = typeof params.sort === 'string' && params.sort in SORTABLE_FIELDS
    ? (params.sort as SortField)
    : 'fullName'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'
  return { sort, dir } as const
}

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
  const { sort, dir } = parseSort(params)
  const canSeeStaffContact = session.permissions.can('staff.read')

  const { users, rolesByUserId, staffByUserId, totalCount } = await withUserContext(session.authUserId, async (tx) => {
    // Role name isn't a direct app_users column (no declared Prisma relation
    // either — user_roles.user_id is a plain FK), so a name match resolves
    // to a set of userIds first and joins the rest of the search as an OR.
    const roleMatchIds = q
      ? (
          await tx.userRole.findMany({
            where: { revokedAt: null, role: { name: { contains: q, mode: 'insensitive' } } },
            select: { userId: true },
          })
        ).map((r) => r.userId)
      : []
    const where = q
      ? {
          deletedAt: null,
          OR: [
            { fullName: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            ...(roleMatchIds.length ? [{ id: { in: roleMatchIds } }] : []),
          ],
        }
      : { deletedAt: null }
    const [users, totalCount] = await Promise.all([
      tx.appUser.findMany({
        where,
        orderBy: [{ [SORTABLE_FIELDS[sort]]: dir }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.appUser.count({ where }),
    ])
    const userIds = users.map((u) => u.id)
    const [userRoles, staffProfiles] = await Promise.all([
      userIds.length
        ? tx.userRole.findMany({ where: { userId: { in: userIds }, revokedAt: null }, include: { role: true } })
        : Promise.resolve([]),
      userIds.length && canSeeStaffContact
        ? tx.staffProfile.findMany({ where: { userId: { in: userIds }, deletedAt: null } })
        : Promise.resolve([]),
    ])
    const rolesByUserId = new Map<string, string[]>()
    for (const ur of userRoles) {
      const names = rolesByUserId.get(ur.userId) ?? []
      names.push(ur.role.name)
      rolesByUserId.set(ur.userId, names)
    }
    const staffByUserId = new Map(staffProfiles.map((s) => [s.userId, s]))
    return { users, rolesByUserId, staffByUserId, totalCount }
  })

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    roles: rolesByUserId.get(u.id) ?? [],
    isActive: u.isActive,
    phone: staffByUserId.get(u.id)?.phone ?? null,
    position: staffByUserId.get(u.id)?.position ?? null,
    createdAt: u.createdAt.toISOString(),
    canManage: session.permissions.can('users.write'),
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
        showStaffContact={canSeeStaffContact}
      />
    </div>
  )
}
