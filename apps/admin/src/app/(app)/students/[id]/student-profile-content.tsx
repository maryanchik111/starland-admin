import { notFound } from 'next/navigation'
import { prisma, withUserContext } from '@starland/db'
import { requireSession } from '@/lib/session'
import { getStudentHealthWithPermissions, getStudentHealthNoteWithPermissions } from '@/lib/students/health'

/**
 * Pure data-fetching — no JSX. `StudentProfileView` (a Client Component)
 * does the rendering. See the comment atop
 * `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx` for why
 * this split exists.
 */
export async function getStudentProfileData(id: string) {
  const session = await requireSession()

  const canReadHealth = session.permissions.can('health.read')
  const canReadHealthNote = session.permissions.can('health_notes.read')
  const canWriteHealth = session.permissions.can('health.write')

  // These four reads don't depend on each other's results (health/health-note
  // only need `id`, which is already known), but each `withUserContext` call
  // is its own remote transaction round trip. Awaiting them one at a time
  // stacks four round trips serially; running them concurrently overlaps the
  // network latency instead, which is most of what made this modal slow.
  const [{ student, className, consentEnteredByName }, health, healthNote, allClasses] = await Promise.all([
    withUserContext(session.authUserId, async (tx) => {
      const student = await tx.student.findUnique({
        where: { id },
        include: {
          enrollments: { where: { toDate: null }, take: 1 },
          guardianships: { where: { deletedAt: null }, include: { person: true } },
          measurements: { orderBy: { measuredOn: 'desc' }, take: 10 },
        },
      })
      const classId = student?.enrollments[0]?.classId
      const cls = classId
        ? await tx.class.findUnique({ where: { id: classId }, select: { name: true } })
        : null
      // Resolved through PersonLink, never a bare UUID (CLAUDE.md §6: any
      // mention of a person in the UI is clickable).
      const enteredBy = student?.parentalConsentEnteredBy
        ? await tx.appUser.findUnique({ where: { id: student.parentalConsentEnteredBy }, select: { fullName: true } })
        : null
      return { student, className: cls?.name ?? null, consentEnteredByName: enteredBy?.fullName ?? null }
    }),
    canReadHealth
      ? getStudentHealthWithPermissions(session.permissions, { authUserId: session.authUserId }, id)
      : Promise.resolve(null),
    canReadHealthNote
      ? getStudentHealthNoteWithPermissions(session.permissions, { authUserId: session.authUserId }, id)
      : Promise.resolve(null),
    prisma.class.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true } }),
  ])
  if (!student) notFound()

  const classId = student.enrollments[0]?.classId ?? null
  const canEdit = classId
    ? session.permissions.can('students.write', { type: 'class', id: classId })
    : false

  const availableClasses = allClasses.filter((c) =>
    session.permissions.can('students.write', { type: 'class', id: c.id }),
  )

  return {
    id,
    student: {
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName,
      bornOn: student.bornOn.toISOString().slice(0, 10),
      livingAddress: student.livingAddress,
      criticalNote: student.criticalNote,
      parentalConsentGivenAt: student.parentalConsentGivenAt ? student.parentalConsentGivenAt.toISOString().slice(0, 10) : null,
      parentalConsentEnteredBy: student.parentalConsentEnteredBy,
    },
    className,
    consentEnteredByName,
    classId,
    canEdit,
    guardians: student.guardianships.map((g) => ({
      guardianshipId: g.id,
      fullName: `${g.person.lastName} ${g.person.firstName}`,
      relation: g.relation,
      phone: g.person.phone,
    })),
    measurements: student.measurements.map((m) => ({
      id: m.id,
      measuredOn: m.measuredOn.toISOString().slice(0, 10),
      heightCm: m.heightCm,
      weightKg: m.weightKg !== null ? m.weightKg.toString() : null,
    })),
    canReadHealth,
    canReadHealthNote,
    canWriteHealth,
    health,
    healthNote,
    availableClasses,
  }
}

export type StudentProfileData = Awaited<ReturnType<typeof getStudentProfileData>>
