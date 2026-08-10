import { redirect } from 'next/navigation'
import { z } from 'zod'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { createStudent } from '@/app/(app)/students/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateStudentForm } from './create-student-form'

export default async function NewStudentPage() {
  const session = await requireSession()
  // Direct-URL guard: the button that links here is already hidden without
  // `students.write`, but the page needs its own check too (CLAUDE.md §6).
  if (!session.permissions.can('students.write')) redirect('/students')

  async function submitNewStudent(
    raw: unknown,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    'use server'

    try {
      const { id } = await createStudent(raw)
      return { ok: true, id }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.students.createError }
      }
      return { ok: false, message: uk.students.createError }
    }
  }

  return (
    <div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{uk.students.newStudent}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateStudentForm submitAction={submitNewStudent} />
        </CardContent>
      </Card>
    </div>
  )
}
