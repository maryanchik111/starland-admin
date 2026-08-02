import { notFound } from 'next/navigation'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()

  // Через контекст користувача: чужий учень повертає null і сторінка дає 404,
  // а не «знайшли, але не показали».
  // The class name is fetched separately rather than as a nested
  // `include: { class: true }`: `class` is a required relation, `classes.read`
  // is a separate permission from `students.read`, and Prisma throws on a
  // required relation the viewer's RLS hides. See apps/admin/src/app/students/page.tsx.
  const { student, className } = await withUserContext(session.authUserId, async (tx) => {
    const student = await tx.student.findUnique({
      where: { id },
      include: {
        enrollments: { where: { toDate: null }, take: 1 },
        guardianships: { include: { person: true } },
        measurements: { orderBy: { measuredOn: 'desc' }, take: 10 },
      },
    })
    const classId = student?.enrollments[0]?.classId
    const cls = classId
      ? await tx.class.findUnique({ where: { id: classId }, select: { name: true } })
      : null
    return { student, className: cls?.name ?? null }
  })
  if (!student) notFound()

  const classId = student.enrollments[0]?.classId
  const canEdit = classId
    ? session.permissions.can('students.write', { type: 'class', id: classId })
    : false

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{student.lastName} {student.firstName}</h1>
      {student.criticalNote && (
        <p className="my-3 rounded bg-red-50 p-3 text-red-800">
          <strong>{uk.students.criticalNote}:</strong> {student.criticalNote}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <dt>{uk.students.class}</dt><dd>{className ?? '—'}</dd>
        <dt>{uk.students.bornOn}</dt><dd>{student.bornOn.toLocaleDateString('uk-UA')}</dd>
        <dt>{uk.students.address}</dt><dd>{student.livingAddress ?? '—'}</dd>
      </dl>

      <h2 className="mt-6 font-semibold">{uk.students.guardians}</h2>
      <ul>
        {student.guardianships.map((g) => (
          <li key={g.id}>{g.person.lastName} {g.person.firstName} — {g.relation} {g.person.phone ?? ''}</li>
        ))}
      </ul>

      {canEdit && <a className="mt-6 inline-block underline" href={`/students/${id}/edit`}>{uk.common.edit}</a>}
    </main>
  )
}
