'use server'

import { prisma } from '@starland/db'
import { NotFoundError } from '@starland/domain'
import { requireSession } from '@/lib/session'
import { updateStudentWithPermissions } from '@/lib/students/update-student'
import { createStudentWithPermissions } from '@/lib/students/create-student'
import { assignClassWithPermissions } from '@/lib/students/assign-class'
import { changeEnrollmentStatusWithPermissions } from '@/lib/students/change-enrollment-status'
import { linkGuardianWithPermissions } from '@/lib/students/link-guardian'
import { unlinkGuardianWithPermissions } from '@/lib/students/unlink-guardian'
import { searchGuardiansWithPermissions } from '@/lib/students/search-guardians'
import {
  updateStudentHealthWithPermissions,
  updateStudentHealthNoteWithPermissions,
} from '@/lib/students/health'

async function currentClassId(studentId: string): Promise<string | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, toDate: null },
    select: { classId: true },
  })
  return enrollment?.classId ?? null
}

// A freshly created student (Task 10) has no enrollment until assigned a
// class (Task 11), so `currentClassId` can genuinely be null. The edit/
// guardian UI already hides itself for that case (`canEdit`/`canManage`
// derive from the same optional classId), but a Server Action is reachable
// directly regardless of what the UI renders -- it must fail with a typed
// error, not an unhandled PrismaClientKnownRequestError from
// findFirstOrThrow leaking internals to the client.
function requireClassId(classId: string | null, studentId: string): string {
  if (!classId) throw new NotFoundError('active enrollment for student', studentId)
  return classId
}

export async function searchGuardians(classId: string, query: string) {
  const session = await requireSession()
  return searchGuardiansWithPermissions(session.permissions, prisma.guardianPerson, classId, query)
}

export async function linkGuardian(studentId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  const classId = requireClassId(await currentClassId(studentId), studentId)
  return linkGuardianWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { studentId, classId },
    raw,
  )
}

export async function unlinkGuardian(studentId: string, guardianshipId: string): Promise<void> {
  const session = await requireSession()
  const classId = requireClassId(await currentClassId(studentId), studentId)
  await unlinkGuardianWithPermissions(session.permissions, { authUserId: session.authUserId }, { classId }, guardianshipId)
}

export async function assignClass(studentId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return assignClassWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { studentId },
    raw,
  )
}

export async function changeEnrollmentStatus(studentId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return changeEnrollmentStatusWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { studentId },
    raw,
  )
}

export async function createStudent(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createStudentWithPermissions(session.permissions, { authUserId: session.authUserId }, raw)
}

export async function updateStudent(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  const classId = requireClassId(await currentClassId(studentId), studentId)
  await updateStudentWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { id: studentId, classId },
    raw,
  )
}

export async function updateStudentHealth(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await updateStudentHealthWithPermissions(session.permissions, { authUserId: session.authUserId }, studentId, raw)
}

export async function updateStudentHealthNote(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  await updateStudentHealthNoteWithPermissions(session.permissions, { authUserId: session.authUserId }, studentId, raw)
}
