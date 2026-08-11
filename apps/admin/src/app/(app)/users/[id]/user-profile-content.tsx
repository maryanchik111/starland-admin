import { notFound } from 'next/navigation'
import { withUserContext } from '@starland/db'
import { requireSession } from '@/lib/session'
import { getEffectivePermissionsProfile } from '@/lib/users/effective-permissions'
import { getPersonActivityLogWithPermissions, type ActivityLogTarget } from '@/lib/audit/get-person-activity-log'

/**
 * Pure data-fetching — no JSX. `UserProfileView` (a Client Component) is
 * what actually renders the profile; this only exists as a plain server
 * function called from `modal-actions.tsx`.
 *
 * This split exists because of a long-standing Next.js limitation
 * (vercel/next.js#59565, #58125, #85883): a Server Action that *returns*
 * JSX only works if the Client Components inside that JSX (here, Radix
 * `Tabs`) are also statically imported/rendered by some `page.tsx` — true
 * regardless of bundler (Turbopack or webpack). Since no route renders a
 * person's profile anymore (CLAUDE.md decision: modals never touch the
 * URL), there is no such page, so returning JSX from the loader crashes
 * with "Could not find the module ... in the React Client Manifest." The
 * fix is this file: return plain, JSON-shaped data and let an actual
 * Client Component (imported directly into `PersonModalProvider`, which
 * lives in every page's normal client bundle) do the rendering.
 */
export async function getUserProfileData(id: string) {
  const session = await requireSession()
  // No route to redirect within anymore — this only runs on demand from a
  // modal (CLAUDE.md decision: no URL navigation for profiles). The caller
  // (list row, PersonLink, command palette) already hides the trigger
  // without this permission; this is the defense-in-depth check for a
  // direct call to `getUserProfileData`.
  if (!session.permissions.can('users.read')) throw new Error('forbidden')

  const canManageStaff = session.permissions.can('staff.write')
  const canViewStaff = canManageStaff || session.permissions.can('staff.read')
  const canManageRoles = session.permissions.can('roles.manage')
  const canViewAuditLog = session.permissions.can('audit.read')
  const canManageUsers = session.permissions.can('users.write')

  const {
    user,
    activeRoles,
    allRoles,
    effectiveRows,
    grantedByNameById,
    teachingAssignments,
    assignableSubjects,
    assignableClasses,
    assignablePeriods,
    activeGrants,
    allPermissions,
    staffProfile,
    staffAwards,
    activityLog,
    staffPositions,
  } = await withUserContext(session.authUserId, async (tx) => {
      const user = await tx.appUser.findUnique({ where: { id } })
      if (!user) {
        return {
          user: null,
          activeRoles: [],
          allRoles: [],
          effectiveRows: [],
          grantedByNameById: new Map<string, string>(),
          teachingAssignments: [],
          assignableSubjects: [],
          assignableClasses: [],
          assignablePeriods: [],
          activeGrants: [],
          allPermissions: [],
          staffProfile: { phone: null, category: null, experienceYears: null, positionCode: null, employmentStatus: 'working' as const },
          staffAwards: [],
          activityLog: [],
          staffPositions: [],
        }
      }

      const [activeRoles, allRoles, effectiveRows, rawTeachingAssignments, rawActiveGrants, allPermissions] = await Promise.all([
        tx.userRole.findMany({ where: { userId: id, revokedAt: null }, include: { role: true } }),
        tx.role.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, name: true } }),
        getEffectivePermissionsProfile(tx, session.permissions, { userId: id }),
        tx.teachingAssignment.findMany({
          where: { teacherUserId: id, deletedAt: null },
          include: { subject: true, class: true },
          orderBy: [{ subject: { name: 'asc' } }],
        }),
        canManageRoles
          ? tx.permissionGrant.findMany({
              where: { userId: id, revokedAt: null },
              include: { permission: true },
              orderBy: [{ createdAt: 'desc' }],
            })
          : Promise.resolve([]),
        // Unconditional, unlike the grant-picker fetches above: every viewer
        // of the "effective permissions" tab needs Ukrainian labels, not
        // just directors who can also issue grants. `permissions` is a small
        // reference table, so fetching it always is cheap.
        tx.permission.findMany({ orderBy: [{ category: 'asc' }, { code: 'asc' }], select: { code: true, description: true } }),
      ])
      const activeGrants = rawActiveGrants.map((g) => ({
        id: g.id,
        permissionCode: g.permission.code,
        permissionDescription: g.permission.description,
        reason: g.reason,
        expiresAt: g.expiresAt,
        createdAt: g.createdAt,
      }))
      // TeachingAssignment has no `period` relation declared on the Prisma
      // model (only subject/class) — periodId is resolved separately.
      const periods = rawTeachingAssignments.length
        ? await tx.academicPeriod.findMany({
          where: { id: { in: rawTeachingAssignments.map((ta) => ta.periodId) } },
          select: { id: true, name: true },
        })
        : []
      const periodNameById = new Map(periods.map((p) => [p.id, p.name]))
      const teachingAssignments = rawTeachingAssignments.map((ta) => ({
        id: ta.id,
        subjectName: ta.subject.name,
        className: ta.class.name,
        periodName: periodNameById.get(ta.periodId) ?? ta.periodId,
      }))

      // Options for the "assign teaching" form — only fetched for viewers who
      // can actually use it, scoped to the current academic year (assigning
      // a teacher into a past/future year's class doesn't make sense here).
      let assignableSubjects: { id: string; name: string }[] = []
      let assignableClasses: { id: string; name: string }[] = []
      let assignablePeriods: { id: string; name: string }[] = []
      if (canManageStaff) {
        const currentYear = await tx.academicYear.findFirst({ where: { isCurrent: true } })
        const [subjects, classes, periodsForYear] = await Promise.all([
          tx.subject.findMany({ where: { deletedAt: null }, orderBy: [{ name: 'asc' }], select: { id: true, name: true } }),
          currentYear
            ? tx.class.findMany({
              where: { academicYearId: currentYear.id, deletedAt: null },
              orderBy: [{ name: 'asc' }],
              select: { id: true, name: true },
            })
            : Promise.resolve([]),
          currentYear
            ? tx.academicPeriod.findMany({
              where: { academicYearId: currentYear.id },
              orderBy: [{ ordinal: 'asc' }],
              select: { id: true, name: true },
            })
            : Promise.resolve([]),
        ])
        assignableSubjects = subjects
        assignableClasses = classes
        assignablePeriods = periodsForYear
      }

      // "Ким видано" resolves through PersonLink, never a bare UUID (CLAUDE.md
      // §3: the effective-permissions screen must show who/when a role or
      // grant came from).
      const granterIds = new Set<string>()
      for (const row of effectiveRows) {
        for (const origin of row.origins) {
          if (origin.grantedBy) granterIds.add(origin.grantedBy)
        }
      }
      const granters = granterIds.size
        ? await tx.appUser.findMany({ where: { id: { in: [...granterIds] } }, select: { id: true, fullName: true } })
        : []
      const grantedByNameById = new Map(granters.map((g) => [g.id, g.fullName]))

      let staffProfile: {
        phone: string | null
        category: string | null
        experienceYears: number | null
        positionCode: string | null
        employmentStatus: 'working' | 'vacation' | 'sick_leave' | 'maternity_leave' | 'unpaid_leave' | 'dismissed'
      } = {
        phone: null,
        category: null,
        experienceYears: null,
        positionCode: null,
        employmentStatus: 'working',
      }
      let staffAwards: { id: string; title: string; awardedOn: Date }[] = []
      let staffPositions: { code: string; name: string }[] = []
      let employeeId: string | null = null
      if (canViewStaff) {
        const [employee, positions] = await Promise.all([
          tx.employee.findUnique({
            where: { userId: id },
            select: { phone: true, category: true, experienceYears: true, positionCode: true, employmentStatus: true, id: true, deletedAt: true },
          }),
          tx.staffPosition.findMany({ where: { deletedAt: null }, orderBy: [{ name: 'asc' }], select: { code: true, name: true } }),
        ])
        staffPositions = positions
        if (employee && !employee.deletedAt) {
          staffProfile = employee
          employeeId = employee.id
          staffAwards = await tx.staffAward.findMany({
            where: { employeeId: employee.id, deletedAt: null },
            orderBy: [{ awardedOn: 'desc' }],
            select: { id: true, title: true, awardedOn: true },
          })
        }
      }

      // "Журнал дій" aggregates every audit_logs row that belongs to this
      // person — not just the currently-active roles/grants/teaching
      // assignments another tab already has in hand, but the full
      // historical set (a revoked role's user_roles row still exists, still
      // has its own audit trail, and isn't in `activeRoles` above).
      let activityLog: Awaited<ReturnType<typeof getPersonActivityLogWithPermissions>> = []
      if (canViewAuditLog) {
        const [allUserRoleRows, allGrantRows, allTeachingRows] = await Promise.all([
          tx.userRole.findMany({ where: { userId: id }, select: { id: true } }),
          tx.permissionGrant.findMany({ where: { userId: id }, select: { id: true } }),
          tx.teachingAssignment.findMany({ where: { teacherUserId: id }, select: { id: true } }),
        ])
        const targets: ActivityLogTarget[] = [
          { entityType: 'app_users', entityId: id },
          ...(employeeId ? [{ entityType: 'employees', entityId: employeeId }] : []),
          ...allUserRoleRows.map((r) => ({ entityType: 'user_roles', entityId: r.id })),
          ...allGrantRows.map((g) => ({ entityType: 'permission_grants', entityId: g.id })),
          ...allTeachingRows.map((t) => ({ entityType: 'teaching_assignments', entityId: t.id })),
        ]
        activityLog = await getPersonActivityLogWithPermissions(session.permissions, tx, targets)
      }

      return {
        user,
        activeRoles,
        allRoles,
        effectiveRows,
        grantedByNameById,
        teachingAssignments,
        assignableSubjects,
        assignableClasses,
        assignablePeriods,
        activeGrants,
        allPermissions,
        staffProfile,
        staffAwards,
        activityLog,
        staffPositions,
      }
    })
  if (!user) notFound()

  // A teaching-assignment picker is only useful to someone who can assign
  // them; absent that, the tab is only worth showing when there's actually
  // something in it — a security guard's or accountant's profile has
  // neither, and a stray "Викладання" tab there was just noise.
  const canShowTeachingTab = canManageStaff || teachingAssignments.length > 0

  return {
    id,
    user: { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt, isActive: user.isActive },
    activeRoles: activeRoles.map((ur) => ({ id: ur.id, roleCode: ur.role.code, roleName: ur.role.name })),
    allRoles,
    effectiveRows,
    grantedByNameById: [...grantedByNameById.entries()],
    teachingAssignments,
    assignableSubjects,
    assignableClasses,
    assignablePeriods,
    activeGrants,
    allPermissions,
    staffProfile,
    staffAwards,
    activityLog,
    staffPositions,
    canManageUsers,
    canManageStaff,
    canViewStaff,
    canManageRoles,
    canViewAuditLog,
    canShowTeachingTab,
  }
}

export type UserProfileData = Awaited<ReturnType<typeof getUserProfileData>>
