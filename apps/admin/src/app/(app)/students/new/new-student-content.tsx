import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'

/**
 * Pure data-fetching — no JSX. `NewStudentView` (a Client Component) does
 * the rendering. See the comment atop
 * `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx` for why
 * this split exists.
 */
export async function getNewStudentData() {
  const session = await requireSession()
  // Defense-in-depth: the button that opens this modal is already hidden
  // without `students.write` (CLAUDE.md §6), but a direct call to
  // `getNewStudentData` must still be rejected server-side.
  if (!session.permissions.can('students.write')) throw new Error('forbidden')

  // Class assignment is a separate, class-scoped permission from student
  // creation (createStudentWithPermissions only checks global students.write
  // — a brand-new student has no class yet, so there's no {type:'class', id}
  // to check against). Only classes the current user can actually assign
  // into are offered here; picking a class is optional either way.
  const allClasses = await prisma.class.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true } })
  const availableClasses = allClasses.filter((c) =>
    session.permissions.can('students.write', { type: 'class', id: c.id }),
  )

  return { availableClasses }
}

export type NewStudentData = Awaited<ReturnType<typeof getNewStudentData>>
