import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Users, Activity, Briefcase, UserPlus } from 'lucide-react'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/page-header'
import { NewEntityButton } from '@/components/new-entity-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ListTabs, type ListTab } from '@/components/data-table'
import { UsersTable } from './users-table'
import type { UserRow } from './columns'
import { StudentsTable } from '../students/students-table'
import type { StudentRow } from '../students/columns'
import { StaffTable } from '../staff/staff-table'
import type { StaffRow } from '../staff/columns'

const DEFAULT_PAGE_SIZE = 20

type TabKey = 'all' | 'teachers' | 'students' | 'other'

const USER_SORTABLE_FIELDS = {
  fullName: 'fullName',
  email: 'email',
  status: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
} as const
type UserSortField = keyof typeof USER_SORTABLE_FIELDS

function parseUserSort(params: Record<string, string | string[] | undefined>) {
  const sort = typeof params.sort === 'string' && params.sort in USER_SORTABLE_FIELDS
    ? (params.sort as UserSortField)
    : 'fullName'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'
  return { sort, dir } as const
}

type StudentSortField = 'fullName' | 'bornOn'
function parseStudentSort(params: Record<string, string | string[] | undefined>) {
  const sort: StudentSortField = params.sort === 'bornOn' ? 'bornOn' : 'fullName'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'
  return { sort, dir } as const
}

type StaffSortField = 'fullName' | 'hiredOn'
function parseStaffSort(params: Record<string, string | string[] | undefined>) {
  const sort: StaffSortField = params.sort === 'hiredOn' ? 'hiredOn' : 'fullName'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'
  return { sort, dir } as const
}

/**
 * Single list page for every person in the school — `Users`/`Students`/
 * `Staff` used to be three separate routes (`/users`, `/students`,
 * `/staff`), each with its own sidebar entry and permission gate. They're
 * merged here into one `/users` page with tabs, one per underlying model:
 * `all`/`teachers` read `AppUser` (teacher = has an active `teacher`
 * `UserRole`, not an HR position), `students` reads `Student`, `other` reads
 * `Employee` (the former `/staff` roster — non-login staff plus anyone else
 * on payroll). A tab only appears if the viewer holds its permission
 * (`users.read`, `students.read`, `staff.read` respectively — CLAUDE.md §6:
 * no permission, no render); the active tab runs its own query only, never
 * all four, so switching tabs stays as cheap as loading a single list was
 * before this merge.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const canUsers = session.permissions.can('users.read')
  const canStudents = session.permissions.can('students.read')
  const canStaff = session.permissions.can('staff.read')
  if (!canUsers && !canStudents && !canStaff) redirect('/')

  const availableTabs: ListTab[] = [
    ...(canUsers ? [{ key: 'all', label: uk.users.tabs.all }, { key: 'teachers', label: uk.users.tabs.teachers }] : []),
    ...(canStudents ? [{ key: 'students', label: uk.users.tabs.students }] : []),
    ...(canStaff ? [{ key: 'other', label: uk.users.tabs.other }] : []),
  ]
  const [firstTab] = availableTabs
  if (!firstTab) redirect('/')

  const params = await searchParams
  const requestedTab = typeof params.tab === 'string' ? params.tab : undefined
  const activeTab = (availableTabs.find((t) => t.key === requestedTab) ?? firstTab).key as TabKey

  const q = typeof params.q === 'string' ? params.q : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE)

  let content: ReactNode
  let headerActions: ReactNode = null

  if (activeTab === 'all' || activeTab === 'teachers') {
    const { sort, dir } = parseUserSort(params)
    const canSeeStaffContact = canStaff
    const includeStats = activeTab === 'all'

    const {
      users,
      rolesByUserId,
      staffByUserId,
      totalCount,
      globalTotalCount,
      globalActiveCount,
      globalStaffCount,
      globalNewThisMonth,
    } = await withUserContext(session.authUserId, async (tx) => {
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
      // "Teacher" is a role, not an HR position or a teaching assignment —
      // confirmed decision, see docs/plans/2026-08-11-unified-people-list-page.md.
      const teacherIds = activeTab === 'teachers'
        ? (
            await tx.userRole.findMany({
              where: { revokedAt: null, role: { code: 'teacher' } },
              select: { userId: true },
            })
          ).map((r) => r.userId)
        : null

      const where = {
        deletedAt: null,
        ...(teacherIds ? { id: { in: teacherIds } } : {}),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
                ...(roleMatchIds.length ? [{ id: { in: roleMatchIds } }] : []),
              ],
            }
          : {}),
      }
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [users, totalCount, globalTotalCount, globalActiveCount, globalStaffCount, globalNewThisMonth] = await Promise.all([
        tx.appUser.findMany({
          where,
          orderBy: [{ [USER_SORTABLE_FIELDS[sort]]: dir }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.appUser.count({ where }),
        includeStats ? tx.appUser.count({ where: { deletedAt: null } }) : Promise.resolve(0),
        includeStats ? tx.appUser.count({ where: { deletedAt: null, isActive: true } }) : Promise.resolve(0),
        includeStats ? tx.employee.count({ where: { deletedAt: null } }) : Promise.resolve(0),
        includeStats
          ? tx.appUser.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } })
          : Promise.resolve(0),
      ])
      const userIds = users.map((u) => u.id)
      const [userRoles, staffProfiles] = await Promise.all([
        userIds.length
          ? tx.userRole.findMany({ where: { userId: { in: userIds }, revokedAt: null }, include: { role: true } })
          : Promise.resolve([]),
        userIds.length && canSeeStaffContact
          ? tx.employee.findMany({ where: { userId: { in: userIds }, deletedAt: null }, include: { position: true } })
          : Promise.resolve([]),
      ])
      const rolesByUserId = new Map<string, string[]>()
      for (const ur of userRoles) {
        const names = rolesByUserId.get(ur.userId) ?? []
        names.push(ur.role.name)
        rolesByUserId.set(ur.userId, names)
      }
      const staffByUserId = new Map(
        staffProfiles.filter((s): s is typeof s & { userId: string } => s.userId !== null).map((s) => [s.userId, s]),
      )
      return { users, rolesByUserId, staffByUserId, totalCount, globalTotalCount, globalActiveCount, globalStaffCount, globalNewThisMonth }
    })

    const rows: UserRow[] = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      roles: rolesByUserId.get(u.id) ?? [],
      isActive: u.isActive,
      phone: staffByUserId.get(u.id)?.phone ?? null,
      position: staffByUserId.get(u.id)?.position?.name ?? null,
      createdAt: u.createdAt.toISOString(),
      canManage: session.permissions.can('users.write'),
    }))

    headerActions = session.permissions.can('users.write') && (
      <NewEntityButton kind="user" label={uk.users.newUser} />
    )

    content = (
      <>
        {includeStats && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="py-4 gap-4 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                <CardTitle className="text-sm font-medium">Всього користувачів</CardTitle>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{globalTotalCount}</div>
                <p className="text-xs text-muted-foreground">Зареєстровано в системі</p>
              </CardContent>
            </Card>
            <Card className="py-4 gap-4 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                <CardTitle className="text-sm font-medium">Активні</CardTitle>
                <Activity className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{globalActiveCount}</div>
                <p className="text-xs text-muted-foreground">Мають доступ до системи</p>
              </CardContent>
            </Card>
            <Card className="py-4 gap-4 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                <CardTitle className="text-sm font-medium">Персонал</CardTitle>
                <Briefcase className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{globalStaffCount}</div>
                <p className="text-xs text-muted-foreground">Співробітники школи</p>
              </CardContent>
            </Card>
            <Card className="py-4 gap-4 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
                <CardTitle className="text-sm font-medium">Нові користувачі</CardTitle>
                <UserPlus className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">+{globalNewThisMonth}</div>
                <p className="text-xs text-muted-foreground">За останні 30 днів</p>
              </CardContent>
            </Card>
          </div>
        )}
        <UsersTable
          data={rows}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          searchParams={params}
          showStaffContact={canSeeStaffContact}
        />
      </>
    )
  } else if (activeTab === 'students') {
    const { sort, dir } = parseStudentSort(params)

    const { students, classNames, guardianByStudentId, totalCount } = await withUserContext(session.authUserId, async (tx) => {
      const where = q
        ? {
            OR: [
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { enrollments: { some: { toDate: null, class: { name: { contains: q, mode: 'insensitive' as const } } } } },
            ],
          }
        : undefined
      const orderBy =
        sort === 'bornOn' ? [{ bornOn: dir }] : [{ lastName: dir }, { firstName: dir }]
      const [students, totalCount] = await Promise.all([
        tx.student.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { enrollments: { where: { toDate: null }, take: 1 } },
        }),
        tx.student.count({ where }),
      ])
      const classIds = students.flatMap((s) => (s.enrollments[0] ? [s.enrollments[0].classId] : []))
      const studentIds = students.map((s) => s.id)
      const [classes, guardianships] = await Promise.all([
        classIds.length
          ? tx.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
          : Promise.resolve([]),
        studentIds.length
          ? tx.guardianship.findMany({
              where: { studentId: { in: studentIds }, deletedAt: null },
              orderBy: [{ isLegalRepresentative: 'desc' }, { createdAt: 'asc' }],
              include: { person: true },
            })
          : Promise.resolve([]),
      ])
      // `guardianships` is ordered so the first row per studentId encountered
      // below is the preferred contact (legal representative first).
      const guardianByStudentId = new Map<string, { fullName: string; phone: string | null }>()
      for (const g of guardianships) {
        if (guardianByStudentId.has(g.studentId)) continue
        guardianByStudentId.set(g.studentId, {
          fullName: `${g.person.lastName} ${g.person.firstName}`,
          phone: g.person.phone,
        })
      }
      return {
        students,
        classNames: new Map(classes.map((c) => [c.id, c.name])),
        guardianByStudentId,
        totalCount,
      }
    })

    const rows: StudentRow[] = students.map((s) => {
      const classId = s.enrollments[0]?.classId
      return {
        id: s.id,
        fullName: `${s.lastName} ${s.firstName}`,
        className: classId ? (classNames.get(classId) ?? null) : null,
        bornOn: s.bornOn.toISOString(),
        criticalNote: s.criticalNote,
        guardian: guardianByStudentId.get(s.id) ?? null,
        isEnrolled: Boolean(classId),
      }
    })

    headerActions = session.permissions.can('students.write') && (
      <NewEntityButton kind="student" label={uk.students.newStudent} />
    )

    content = <StudentsTable data={rows} page={page} pageSize={pageSize} totalCount={totalCount} searchParams={params} />
  } else {
    const { sort, dir } = parseStaffSort(params)

    const { employees, totalCount } = await withUserContext(session.authUserId, async (tx) => {
      const where = {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q, mode: 'insensitive' as const } },
                { position: { name: { contains: q, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      }
      const orderBy =
        sort === 'hiredOn' ? [{ hiredOn: dir }] : [{ lastName: dir }, { firstName: dir }]
      const [employees, totalCount] = await Promise.all([
        tx.employee.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { position: true },
        }),
        tx.employee.count({ where }),
      ])
      return { employees, totalCount }
    })

    const rows: StaffRow[] = employees.map((e) => ({
      id: e.id,
      userId: e.userId,
      fullName: `${e.lastName} ${e.firstName}`,
      positionName: e.position?.name ?? null,
      employmentStatus: e.employmentStatus,
      phone: e.phone,
      hiredOn: e.hiredOn ? e.hiredOn.toISOString() : null,
    }))

    headerActions = session.permissions.can('staff.write') && (
      <NewEntityButton kind="staff" label={uk.staff.addEmployee} />
    )

    content = <StaffTable data={rows} page={page} pageSize={pageSize} totalCount={totalCount} searchParams={params} />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={uk.users.title} actions={headerActions} />
      {availableTabs.length > 1 && (
        <ListTabs basePath="/users" searchParams={params} tabs={availableTabs} activeTab={activeTab} />
      )}
      {content}
    </div>
  )
}
