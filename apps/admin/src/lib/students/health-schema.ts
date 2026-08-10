import { z } from 'zod'

/**
 * Split out of health.ts so client components (health-section.tsx) can
 * import just the schemas without pulling in @starland/db's Prisma client
 * (and its APP_DATABASE_URL requirement) into the client bundle — Next.js
 * bundles a module's whole import graph, not just the named export actually
 * used. Same reasoning as create-student-schema.ts.
 */
export const UpdateStudentHealthInput = z.object({
  healthGroup: z.string().trim().min(1, 'healthGroup must not be empty').optional(),
  peGroup: z.string().trim().min(1, 'peGroup must not be empty').optional(),
  allergyCodes: z.array(z.string().trim().min(1)).optional(),
  chronicCodes: z.array(z.string().trim().min(1)).optional(),
  activityLimits: z.string().trim().max(500).optional(),
})

export type UpdateStudentHealthInput = z.infer<typeof UpdateStudentHealthInput>

export const UpdateStudentHealthNoteInput = z.object({
  content: z.string().trim().max(5000, 'content must be 5000 characters or fewer'),
})

export type UpdateStudentHealthNoteInput = z.infer<typeof UpdateStudentHealthNoteInput>
