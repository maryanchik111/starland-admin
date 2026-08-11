import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'

/**
 * Pure data-fetching — no JSX. `NewEmployeeView` (a Client Component) does
 * the rendering. See the comment atop
 * `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx` for why
 * this split exists.
 */
export async function getNewEmployeeData() {
  const session = await requireSession()
  // Defense-in-depth: the button that opens this modal is already hidden
  // without `staff.write` (CLAUDE.md §6), but a direct call to
  // `getNewEmployeeData` must still be rejected server-side.
  if (!session.permissions.can('staff.write')) throw new Error('forbidden')

  const positions = await prisma.staffPosition.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: 'asc' }],
    select: { code: true, name: true },
  })

  return { positions }
}

export type NewEmployeeData = Awaited<ReturnType<typeof getNewEmployeeData>>
