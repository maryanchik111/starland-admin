import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * The slice of `supabase.auth.admin` the domain layer actually calls.
 * Kept narrow and injectable so `createUserWithPermissions` can be tested
 * against a fake that still exercises the real database, without every test
 * run needing SUPABASE_SERVICE_ROLE_KEY or making real network calls.
 */
export interface AdminAuthClient {
  createUser(args: {
    email: string
    password: string
    email_confirm: boolean
  }): Promise<{ userId: string | null; errorMessage: string | null }>
  deleteUser(userId: string): Promise<{ errorMessage: string | null }>
}

let cached: AdminAuthClient | null = null

/**
 * CLAUDE.md §2.2: SUPABASE_SERVICE_ROLE_KEY never ships to the client bundle
 * and never runs in apps/portal. `import 'server-only'` above enforces the
 * first half at build time; this module living exclusively under
 * apps/admin/src/lib/users enforces the second (apps/portal has no reason to
 * import it, and never should).
 */
export function supabaseAdminAuthClient(): AdminAuthClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  cached = {
    async createUser({ email, password, email_confirm }) {
      const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm })
      return { userId: data.user?.id ?? null, errorMessage: error?.message ?? null }
    },
    async deleteUser(userId) {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      return { errorMessage: error?.message ?? null }
    },
  }
  return cached
}
