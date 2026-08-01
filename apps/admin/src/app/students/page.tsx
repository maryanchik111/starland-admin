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
  const students = await withUserContext(session.authUserId, (tx) =>
    tx.student.findMany({
      where: q
        ? { OR: [{ lastName: { contains: q, mode: 'insensitive' } },
                 { firstName: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 100,
      include: { enrollments: { where: { toDate: null }, include: { class: true }, take: 1 } },
    }),
  )

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
                <td>{s.enrollments[0]?.class.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
