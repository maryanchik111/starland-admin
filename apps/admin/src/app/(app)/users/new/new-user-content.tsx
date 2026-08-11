import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'

/**
 * Pure data-fetching — no JSX. `NewUserView` (a Client Component) does the
 * rendering. See the comment atop `../[id]/user-profile-content.tsx` for
 * why this split exists (Next.js can't ship a Server Action's returned
 * Client Components — like the form's Radix `Select` — across the RSC
 * boundary unless a real route also renders them, and no route renders
 * this anymore).
 */
export async function getNewUserData() {
  const session = await requireSession()
  // Defense-in-depth: the button that opens this modal is already hidden
  // without `users.write` (CLAUDE.md §6), but a direct call to
  // `getNewUserData` must still be rejected server-side.
  if (!session.permissions.can('users.write')) throw new Error('forbidden')

  const roles = await prisma.role.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, name: true } })
  return { roles }
}

export type NewUserData = Awaited<ReturnType<typeof getNewUserData>>
