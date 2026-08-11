import { notFound } from 'next/navigation'
import { withUserContext } from '@starland/db'
import { requireSession } from '@/lib/session'
import { getPersonActivityLogWithPermissions, type ActivityLogTarget } from '@/lib/audit/get-person-activity-log'
import { getUserProfileData } from '@/app/(app)/users/[id]/user-profile-content'

/**
 * Pure data-fetching — no JSX. `StaffProfileView` (a Client Component) does
 * the rendering. See the comment atop
 * `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx` for why
 * this split exists.
 *
 * Profile for staff with no login account (security, kitchen, cleaning —
 * see docs/plans/2026-08-10-unified-profile-modals.md, Task 7, and
 * docs/plans/2026-08-10-staff-and-status-model.md, Task 5's open question).
 *
 * When the employee row IS linked to an account, the canonical profile is
 * the user's own — this returns a tagged `{ view: 'user' }` result instead
 * of a second, thinner view of the same person; `PersonModalProvider`
 * renders `UserProfileView` for that case.
 */
export async function getStaffProfileData(id: string) {
  const session = await requireSession()
  // Defense-in-depth: the row that opens this modal already only exists for
  // employees the viewer can see (CLAUDE.md §6); a direct call to
  // `loadStaffProfileData` must still be rejected server-side.
  if (!session.permissions.can('staff.read')) throw new Error('forbidden')

  const canManageStaff = session.permissions.can('staff.write')
  const canViewAuditLog = session.permissions.can('audit.read')

  const { employee, awards, positions, activityLog } = await withUserContext(session.authUserId, async (tx) => {
    const employee = await tx.employee.findUnique({ where: { id }, select: {
      id: true, userId: true, firstName: true, lastName: true, middleName: true, phone: true, category: true,
      experienceYears: true, positionCode: true, employmentStatus: true, deletedAt: true,
    } })
    if (!employee || employee.deletedAt) {
      return { employee: null, awards: [], positions: [], activityLog: [] }
    }

    const [awards, positions] = await Promise.all([
      tx.staffAward.findMany({
        where: { employeeId: employee.id, deletedAt: null },
        orderBy: [{ awardedOn: 'desc' }],
        select: { id: true, title: true, awardedOn: true },
      }),
      tx.staffPosition.findMany({ where: { deletedAt: null }, orderBy: [{ name: 'asc' }], select: { code: true, name: true } }),
    ])

    let activityLog: Awaited<ReturnType<typeof getPersonActivityLogWithPermissions>> = []
    if (canViewAuditLog) {
      const targets: ActivityLogTarget[] = [{ entityType: 'employees', entityId: employee.id }]
      activityLog = await getPersonActivityLogWithPermissions(session.permissions, tx, targets)
    }

    return { employee, awards, positions, activityLog }
  })
  if (!employee) notFound()
  if (employee.userId) {
    return { view: 'user' as const, data: await getUserProfileData(employee.userId) }
  }

  const fullName = [employee.lastName, employee.firstName, employee.middleName].filter(Boolean).join(' ')

  return {
    view: 'staff' as const,
    data: {
      id,
      fullName,
      profile: {
        phone: employee.phone,
        category: employee.category,
        experienceYears: employee.experienceYears,
        positionCode: employee.positionCode,
        employmentStatus: employee.employmentStatus,
      },
      awards,
      positions,
      activityLog,
      canManageStaff,
      canViewAuditLog,
    },
  }
}

export type StaffProfileResult = Awaited<ReturnType<typeof getStaffProfileData>>
export type StaffProfileData = Extract<StaffProfileResult, { view: 'staff' }>['data']
