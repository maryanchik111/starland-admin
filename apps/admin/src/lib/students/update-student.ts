import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

const UpdateStudentInput = z.object({
  livingAddress: z.string().trim().min(1, 'livingAddress must not be empty').optional(),
  criticalNote: z.string().trim().max(500).optional(),
})

export type UpdateStudentInput = z.infer<typeof UpdateStudentInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function updateStudentWithPermissions(
  permissions: EffectivePermissions,
  student: { id: string; classId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'students.write', { type: 'class', id: student.classId })
  const input = UpdateStudentInput.parse(raw)
  await prisma.student.update({ where: { id: student.id }, data: input })
}
