import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { updateStudent } from '@/app/(app)/students/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EditStudentForm } from './edit-student-form'

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const student = await withUserContext(session.authUserId, (tx) =>
    tx.student.findUnique({
      where: { id },
      include: { enrollments: { where: { toDate: null }, take: 1 } },
    }),
  )
  if (!student) notFound()

  const classId = student.enrollments[0]?.classId
  const canEdit = classId
    ? session.permissions.can('students.write', { type: 'class', id: classId })
    : false
  if (!canEdit) redirect(`/students/${id}`)

  async function submitEditStudent(
    raw: unknown,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await updateStudent(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.students.updateError }
      }
      return { ok: false, message: uk.students.updateError }
    }
  }

  return (
    <main className="p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            {uk.students.editStudent}: {student.lastName} {student.firstName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EditStudentForm
            studentId={id}
            defaultValues={{
              livingAddress: student.livingAddress ?? undefined,
              criticalNote: student.criticalNote ?? undefined,
            }}
            submitAction={submitEditStudent}
          />
        </CardContent>
      </Card>
    </main>
  )
}
