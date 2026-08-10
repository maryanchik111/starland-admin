import Link from 'next/link'
import { Plus } from 'lucide-react'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { StudentsTable } from './students-table'
import type { StudentRow } from './columns'

const DEFAULT_PAGE_SIZE = 20

type SortField = 'fullName' | 'bornOn'

function parseSort(params: Record<string, string | string[] | undefined>) {
  const sort: SortField = params.sort === 'bornOn' ? 'bornOn' : 'fullName'
  const dir = params.dir === 'desc' ? 'desc' : 'asc'
  return { sort, dir } as const
}

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
  const { sort, dir } = parseSort(params)

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
    const canEdit = classId
      ? session.permissions.can('students.write', { type: 'class', id: classId })
      : session.permissions.can('students.write')
    return {
      id: s.id,
      fullName: `${s.lastName} ${s.firstName}`,
      className: classId ? (classNames.get(classId) ?? null) : null,
      bornOn: s.bornOn.toISOString(),
      criticalNote: s.criticalNote,
      guardian: guardianByStudentId.get(s.id) ?? null,
      isEnrolled: Boolean(classId),
      canEdit,
    }
  })

  const headerActions = session.permissions.can('students.write') && (
    <Button asChild size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
      <Link href="/students/new">
        <Plus className="size-4" /> {uk.students.newStudent}
      </Link>
    </Button>
  )

  return (
    <div className='flex flex-col gap-6'>
      <PageHeader
        title={uk.students.title}
        actions={headerActions}
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
