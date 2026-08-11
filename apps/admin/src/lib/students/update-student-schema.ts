import { z } from 'zod'

/**
 * Split out of update-student.ts so client components (student-info-section.tsx)
 * can import just the schema without pulling in @starland/db's Prisma client
 * (and its APP_DATABASE_URL requirement) into the client bundle — Next.js
 * bundles a module's whole import graph, not just the named export actually used.
 */
export const UpdateStudentInput = z.object({
  firstName: z.string().trim().min(1, 'firstName must not be empty').optional(),
  lastName: z.string().trim().min(1, 'lastName must not be empty').optional(),
  middleName: z.string().trim().min(1, 'middleName must not be empty').optional(),
  bornOn: z.coerce.date().optional(),
  livingAddress: z.string().trim().min(1, 'livingAddress must not be empty').optional(),
  criticalNote: z.string().trim().max(500).optional(),
  parentalConsentGivenAt: z.coerce.date().optional(),
})

export type UpdateStudentInput = z.infer<typeof UpdateStudentInput>
