import { z } from 'zod'

/**
 * Split out of create-user.ts so client components (new-user-form.tsx) can
 * import just the schema without pulling in supabase-admin-client.ts's
 * `import 'server-only'` into the client bundle — Next.js bundles a whole
 * module graph, not just the named export actually used.
 */
export const CreateUserInput = z.object({
  fullName: z.string().trim().min(1, 'fullName must not be empty'),
  email: z.string().trim().toLowerCase().email('email must be valid'),
  roleCode: z.string().trim().min(1, 'roleCode must not be empty'),
  temporaryPassword: z.string().min(12, 'temporaryPassword must be at least 12 characters'),
})

export type CreateUserInput = z.infer<typeof CreateUserInput>
