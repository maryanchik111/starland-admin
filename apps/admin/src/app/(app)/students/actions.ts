'use server'

import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'
import { updateStudentWithPermissions } from '@/lib/students/update-student'
import { createStudentWithPermissions } from '@/lib/students/create-student'
import { assignClassWithPermissions } from '@/lib/students/assign-class'
import { linkGuardianWithPermissions } from '@/lib/students/link-guardian'
import { unlinkGuardianWithPermissions } from '@/lib/students/unlink-guardian'
import { searchGuardiansWithPermissions } from '@/lib/students/search-guardians'

async function currentClassId(studentId: string): Promise<string> {
  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { studentId, toDate: null },
    select: { classId: true },
  })
  return enrollment.classId
}

export async function searchGuardians(classId: string, query: string) {
  const session = await requireSession()
  return searchGuardiansWithPermissions(session.permissions, prisma.guardianPerson, classId, query)
}

export async function linkGuardian(studentId: string, raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  const classId = await currentClassId(studentId)
  return linkGuardianWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { studentId, classId },
    raw,
  )
}

export async function unlinkGuardian(studentId: string, guardianshipId: string): Promise<void> {
  const session = await requireSession()
  const classId = await currentClassId(studentId)
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

export async function createStudent(raw: unknown): Promise<{ id: string }> {
  const session = await requireSession()
  return createStudentWithPermissions(session.permissions, { authUserId: session.authUserId }, raw)
}

export async function updateStudent(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  const classId = await currentClassId(studentId)
  await updateStudentWithPermissions(
    session.permissions,
    { authUserId: session.authUserId },
    { id: studentId, classId },
    raw,
  )
}
