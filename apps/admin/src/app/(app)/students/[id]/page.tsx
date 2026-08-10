import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { prisma, withUserContext } from '@starland/db'
import { ConflictError } from '@starland/domain'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import {
  assignClass,
  linkGuardian,
  searchGuardians,
  unlinkGuardian,
  updateStudentHealth,
  updateStudentHealthNote,
} from '@/app/(app)/students/actions'
import { getStudentHealthWithPermissions, getStudentHealthNoteWithPermissions } from '@/lib/students/health'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { ClassAssign } from './class-assign'
import { GuardiansSection } from './guardians-section'
import { HealthSection } from './health-section'

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()

  // Через контекст користувача: чужий учень повертає null і сторінка дає 404,
  // а не «знайшли, але не показали».
  // The class name is fetched separately rather than as a nested
  // `include: { class: true }`: `class` is a required relation, `classes.read`
  // is a separate permission from `students.read`, and Prisma throws on a
  // required relation the viewer's RLS hides. See apps/admin/src/app/students/page.tsx.
  const { student, className } = await withUserContext(session.authUserId, async (tx) => {
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
    return { student, className: cls?.name ?? null }
  })
  if (!student) notFound()

  const classId = student.enrollments[0]?.classId
  const canEdit = classId
    ? session.permissions.can('students.write', { type: 'class', id: classId })
    : false

  // §6: no permission -> the section does not render at all, not "renders
  // and fails". `health.read` and `health_notes.read` are two independent
  // gates (CLAUDE.md §3), so the note is fetched only when its own,
  // stricter permission is present -- never as a side effect of
  // `health.read`.
  const canReadHealth = session.permissions.can('health.read')
  const canReadHealthNote = session.permissions.can('health_notes.read')
  const canWriteHealth = session.permissions.can('health.write')

  const health = canReadHealth
    ? await getStudentHealthWithPermissions(session.permissions, { authUserId: session.authUserId }, id)
    : null
  const healthNote = canReadHealthNote
    ? await getStudentHealthNoteWithPermissions(session.permissions, { authUserId: session.authUserId }, id)
    : null

  // Classes are a small reference-like list (not personal data), so this
  // reads through the privileged connection rather than requiring the
  // viewer to also hold `classes.read` just to populate the assignment
  // dropdown — the real authorization gate is `assignClassWithPermissions`
  // checking `students.write` against the *chosen* class server-side.
  const allClasses = await prisma.class.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true } })
  const availableClasses = allClasses.filter((c) =>
    session.permissions.can('students.write', { type: 'class', id: c.id }),
  )

  async function submitAssignClass(classId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await assignClass(id, { classId })
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.assignClassError }
      if (err instanceof ConflictError) return { ok: false, message: uk.students.alreadyInClass }
      return { ok: false, message: uk.students.assignClassError }
    }
  }

  async function submitSearchGuardians(query: string) {
    'use server'

    if (!classId) return []
    return searchGuardians(classId, query)
  }

  async function submitLinkGuardian(raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await linkGuardian(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.linkError }
      if (err instanceof ConflictError) return { ok: false, message: uk.students.guardianAlreadyLinked }
      return { ok: false, message: uk.students.linkError }
    }
  }

  async function submitUnlinkGuardian(guardianshipId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await unlinkGuardian(id, guardianshipId)
      return { ok: true }
    } catch {
      return { ok: false, message: uk.students.unlinkError }
    }
  }

  async function submitUpdateHealth(raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await updateStudentHealth(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.students.health.updateError }
      }
      return { ok: false, message: uk.students.health.updateError }
    }
  }

  async function submitUpdateHealthNote(raw: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    'use server'

    try {
      await updateStudentHealthNote(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.students.health.noteUpdateError }
      }
      return { ok: false, message: uk.students.health.noteUpdateError }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">
          {student.lastName} {student.firstName}
        </h1>
        {canEdit && (
          <Button asChild>
            <Link href={`/students/${id}/edit`}>{uk.common.edit}</Link>
          </Button>
        )}
      </div>

      {student.criticalNote && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{uk.students.criticalNote}</AlertTitle>
          <AlertDescription>{student.criticalNote}</AlertDescription>
        </Alert>
      )}

      {/* One card, one background — sections are typographic breaks (a label
          + a divider), not separate elevated boxes. Three stacked Cards for
          a handful of lines each read as mostly empty padding. */}
      <Card className="py-0">
        <CardContent className="divide-y divide-border px-6">
          <section className="py-4 first:pt-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.profile}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{uk.students.class}</dt>
              <dd>
                <ClassAssign
                  currentClassName={className}
                  availableClasses={availableClasses}
                  assignAction={submitAssignClass}
                />
              </dd>
              <dt className="text-muted-foreground">{uk.students.bornOn}</dt>
              <dd>{student.bornOn.toLocaleDateString('uk-UA')}</dd>
              <dt className="text-muted-foreground">{uk.students.address}</dt>
              <dd>{student.livingAddress ?? '—'}</dd>
            </dl>
          </section>

          <section className="py-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.guardians}</h2>
            <GuardiansSection
              guardians={student.guardianships.map((g) => ({
                guardianshipId: g.id,
                fullName: `${g.person.lastName} ${g.person.firstName}`,
                relation: g.relation,
                phone: g.person.phone,
              }))}
              canManage={canEdit}
              searchAction={submitSearchGuardians}
              linkAction={submitLinkGuardian}
              unlinkAction={submitUnlinkGuardian}
            />
          </section>

          <section className="py-4 last:pb-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.measurements}</h2>
            {student.measurements.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {student.measurements.map((m) => (
                  <li key={m.id} className="flex gap-4">
                    <span className="text-muted-foreground">
                      {m.measuredOn.toLocaleDateString('uk-UA')}
                    </span>
                    <span>
                      {m.heightCm != null ? `${uk.students.heightCm}: ${m.heightCm}` : null}
                    </span>
                    <span>
                      {m.weightKg != null ? `${uk.students.weightKg}: ${m.weightKg.toString()}` : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{uk.students.noMeasurements}</p>
            )}
          </section>

          {/* Sensitive medical data: a clearly separate, distinctly-gated
              section (CLAUDE.md §0/§3), not folded into Profile. Absent
              entirely (not shown-and-empty) for a viewer without
              `health.read` -- see `canReadHealth` above. */}
          {canReadHealth && (
            <section className="py-4 last:pb-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.health.title}</h2>
              <HealthSection
                health={health}
                canWrite={canWriteHealth}
                note={healthNote}
                canReadNote={canReadHealthNote}
                updateHealthAction={submitUpdateHealth}
                updateNoteAction={submitUpdateHealthNote}
              />
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
