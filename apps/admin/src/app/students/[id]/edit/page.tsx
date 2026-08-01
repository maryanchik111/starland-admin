import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { withUserContext } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { updateStudent } from '@/app/students/actions'

export default async function EditStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
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

  async function submitEditStudent(formData: FormData): Promise<void> {
    'use server'

    const rawAddress = formData.get('livingAddress')
    const rawNote = formData.get('criticalNote')
    const livingAddress = typeof rawAddress === 'string' && rawAddress !== '' ? rawAddress : undefined
    const criticalNote = typeof rawNote === 'string' && rawNote !== '' ? rawNote : undefined

    try {
      await updateStudent(id, { livingAddress, criticalNote })
    } catch (err) {
      const message = err instanceof z.ZodError ? err.issues[0]?.message : 'Не вдалося зберегти зміни'
      redirect(`/students/${id}/edit?error=${encodeURIComponent(message ?? 'Не вдалося зберегти зміни')}`)
    }
    redirect(`/students/${id}`)
  }

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">{student.lastName} {student.firstName}</h1>
      {error && <p className="mb-3 rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <form action={submitEditStudent} className="flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span>{uk.students.address}</span>
          <input name="livingAddress" defaultValue={student.livingAddress ?? ''}
                 className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span>{uk.students.criticalNote}</span>
          <input name="criticalNote" defaultValue={student.criticalNote ?? ''}
                 className="rounded border px-3 py-2" />
        </label>
        <div className="mt-2 flex gap-3">
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            {uk.common.save}
          </button>
          <a href={`/students/${id}`} className="rounded border px-3 py-2">
            {uk.common.cancel}
          </a>
        </div>
      </form>
    </main>
  )
}
