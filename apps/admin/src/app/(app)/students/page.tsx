import Link from 'next/link'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { StudentsTable } from './students-table'
import type { StudentRow } from './columns'

const DEFAULT_PAGE_SIZE = 20

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE)

  // Запит іде через withUserContext, тому RLS справді відсікає чужих учнів.
  // Через звичайний `prisma` тут була б дірка: те підключення суперкористувацьке
  // й політики його не стосуються.
  // `class` is a REQUIRED relation on `enrollment`, and `classes_read` is a
  // separate permission from `students.read`: several roles (психолог,
  // логопед, медсестра, родина учня) can see a student without being able to
  // see their class. A nested `include: { class: true }` would then make
  // Prisma throw "Field class is required to return data, got null", so the
  // class names are resolved with a second RLS-scoped query and simply render
  // as "—" when the viewer may not read them.
  const { students, classNames, totalCount } = await withUserContext(session.authUserId, async (tx) => {
    const where = q
      ? { OR: [{ lastName: { contains: q, mode: 'insensitive' as const } },
               { firstName: { contains: q, mode: 'insensitive' as const } }] }
      : undefined
    const [students, totalCount] = await Promise.all([
      tx.student.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { enrollments: { where: { toDate: null }, take: 1 } },
      }),
      tx.student.count({ where }),
    ])
    const classIds = students.flatMap((s) => (s.enrollments[0] ? [s.enrollments[0].classId] : []))
    const classes = classIds.length
      ? await tx.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
      : []
    return { students, classNames: new Map(classes.map((c) => [c.id, c.name])), totalCount }
  })

  const rows: StudentRow[] = students.map((s) => {
    const classId = s.enrollments[0]?.classId
    const canEdit = classId
      ? session.permissions.can('students.write', { type: 'class', id: classId })
      : session.permissions.can('students.write')
    return {
      id: s.id,
      fullName: `${s.lastName} ${s.firstName}`,
      className: classId ? (classNames.get(classId) ?? null) : null,
      canEdit,
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        title={uk.students.title}
        actions={
          session.permissions.can('students.write') && (
            <Button asChild>
              <Link href="/students/new">{uk.students.newStudent}</Link>
            </Button>
          )
        }
      />
      <StudentsTable
        data={rows}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        searchParams={params}
      />
    </div>
  )
}
