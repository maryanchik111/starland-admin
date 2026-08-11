import { z } from 'zod'

/**
 * Split out of create-student.ts so client components (create-student-form.tsx)
 * can import just the schema without pulling in @starland/db's Prisma client
 * (and its APP_DATABASE_URL requirement) into the client bundle — Next.js
 * bundles a module's whole import graph, not just the named export actually used.
 */
export const CreateStudentInput = z.object({
  firstName: z.string().trim().min(1, 'firstName must not be empty'),
  lastName: z.string().trim().min(1, 'lastName must not be empty'),
  middleName: z.string().trim().min(1).optional(),
  bornOn: z.coerce.date(),
  livingAddress: z.string().trim().min(1).optional(),
  criticalNote: z.string().trim().max(500).optional(),
  parentalConsentGivenAt: z.coerce.date().optional(),
})

export type CreateStudentInput = z.infer<typeof CreateStudentInput>
