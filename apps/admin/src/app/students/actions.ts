'use server'

import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'
import { updateStudentWithPermissions } from '@/lib/students/update-student'

export async function updateStudent(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { studentId, toDate: null },
    select: { classId: true },
  })
  await updateStudentWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { id: studentId, classId: enrollment.classId },
    raw,
  )
}
