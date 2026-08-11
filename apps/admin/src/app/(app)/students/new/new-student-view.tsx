'use client'

import { z } from 'zod'
import { ConflictError } from '@starland/domain'
import { uk } from '@starland/i18n'
import { createStudent, assignClass } from '@/app/(app)/students/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateStudentForm } from './create-student-form'
import type { NewStudentData } from './new-student-content'

type ActionResult = { ok: true } | { ok: false; message: string }

export function NewStudentView({ data }: { data: NewStudentData }) {
  async function submitNewStudent(
    raw: unknown,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
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

  // Best-effort second step: the student is already created by the time
  // this runs. A failure here does NOT undo the creation — a student with
  // no class yet is a valid, already-supported state (the same one you'd
  // get by skipping this field), fixable from the student's own profile.
  async function submitAssignClassForNewStudent(studentId: string, classId: string): Promise<ActionResult> {
    try {
      await assignClass(studentId, { classId })
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.assignClassError }
      if (err instanceof ConflictError) return { ok: false, message: uk.students.alreadyInClass }
      return { ok: false, message: uk.students.assignClassError }
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{uk.students.newStudent}</CardTitle>
      </CardHeader>
      <CardContent>
        <CreateStudentForm
          availableClasses={data.availableClasses}
          submitAction={submitNewStudent}
          assignClassAction={submitAssignClassForNewStudent}
        />
      </CardContent>
    </Card>
  )
}
