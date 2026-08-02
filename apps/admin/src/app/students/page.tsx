import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PersonLink } from '@/components/person-link'

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await requireSession()
  const { q } = await searchParams

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
  const { students, classNames } = await withUserContext(session.authUserId, async (tx) => {
    const students = await tx.student.findMany({
      where: q
        ? { OR: [{ lastName: { contains: q, mode: 'insensitive' } },
                 { firstName: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 100,
      include: { enrollments: { where: { toDate: null }, take: 1 } },
    })
    const classIds = students.flatMap((s) => (s.enrollments[0] ? [s.enrollments[0].classId] : []))
    const classes = classIds.length
      ? await tx.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
      : []
    return { students, classNames: new Map(classes.map((c) => [c.id, c.name])) }
  })

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">{uk.students.title}</h1>
      <form className="mb-4"><input name="q" defaultValue={q} placeholder={uk.common.search}
             className="rounded border px-3 py-2" /></form>
      {students.length === 0 ? (
        <p className="text-neutral-500">{uk.common.empty}</p>
      ) : (
        <table className="w-full text-left">
          <thead><tr><th>{uk.students.fullName}</th><th>{uk.students.class}</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">
                  <PersonLink id={s.id} kind="student" name={`${s.lastName} ${s.firstName}`} />
                </td>
                <td>{(s.enrollments[0] && classNames.get(s.enrollments[0].classId)) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
