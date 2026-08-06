import Link from 'next/link'
import { notFound } from 'next/navigation'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'

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
    <main className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">
          {student.lastName} {student.firstName}
        </h1>
        {canEdit && (
          <Button asChild>
            <Link href={`/students/${id}/edit`}>{uk.common.edit}</Link>
          </Button>
        )}
      </div>

      {student.criticalNote && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{uk.students.criticalNote}</AlertTitle>
          <AlertDescription>{student.criticalNote}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{uk.students.profile}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{uk.students.class}</dt>
            <dd>{className ?? '—'}</dd>
            <dt className="text-muted-foreground">{uk.students.bornOn}</dt>
            <dd>{student.bornOn.toLocaleDateString('uk-UA')}</dd>
            <dt className="text-muted-foreground">{uk.students.address}</dt>
            <dd>{student.livingAddress ?? '—'}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uk.students.guardians}</CardTitle>
        </CardHeader>
        <CardContent>
          {student.guardianships.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {student.guardianships.map((g) => (
                <li key={g.id}>
                  {g.person.lastName} {g.person.firstName} — {g.relation} {g.person.phone ?? ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{uk.students.noGuardians}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uk.students.measurements}</CardTitle>
        </CardHeader>
        <CardContent>
          {student.measurements.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {student.measurements.map((m) => (
                <li key={m.id} className="flex gap-4">
                  <span className="text-muted-foreground">
                    {m.measuredOn.toLocaleDateString('uk-UA')}
                  </span>
                  <span>
                    {m.heightCm != null ? `${uk.students.heightCm}: ${m.heightCm}` : null}
                  </span>
                  <span>
                    {m.weightKg != null ? `${uk.students.weightKg}: ${m.weightKg.toString()}` : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{uk.students.noMeasurements}</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
