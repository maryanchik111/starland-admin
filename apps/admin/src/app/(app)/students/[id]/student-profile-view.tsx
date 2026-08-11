'use client'

import { z } from 'zod'
import { ConflictError } from '@starland/domain'
import { uk } from '@starland/i18n'
import {
  assignClass,
  changeEnrollmentStatus,
  linkGuardian,
  searchGuardians,
  unlinkGuardian,
  updateStudent,
  updateStudentHealth,
  updateStudentHealthNote,
} from '@/app/(app)/students/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { ClassAssign } from './class-assign'
import { ChangeEnrollmentStatus } from './change-enrollment-status'
import { GuardiansSection } from './guardians-section'
import { HealthSection } from './health-section'
import { StudentInfoSection } from './student-info-section'
import type { StudentProfileData } from './student-profile-content'

type ActionResult = { ok: true } | { ok: false; message: string }

/**
 * Renders `getStudentProfileData`'s result — a plain Client Component. See
 * the comment atop `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx`
 * for why this split from the old server-rendered shell exists.
 */
export function StudentProfileView({ data }: { data: StudentProfileData }) {
  const {
    id,
    student,
    className,
    consentEnteredByName,
    classId,
    canEdit,
    guardians,
    measurements,
    canReadHealth,
    canReadHealthNote,
    canWriteHealth,
    health,
    healthNote,
    availableClasses,
  } = data

  async function submitUpdateStudent(raw: unknown): Promise<ActionResult> {
    try {
      await updateStudent(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.updateError }
      return { ok: false, message: uk.students.updateError }
    }
  }

  async function submitAssignClass(newClassId: string): Promise<ActionResult> {
    try {
      await assignClass(id, { classId: newClassId })
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.assignClassError }
      if (err instanceof ConflictError) return { ok: false, message: uk.students.alreadyInClass }
      return { ok: false, message: uk.students.assignClassError }
    }
  }

  async function submitChangeEnrollmentStatus(raw: unknown): Promise<ActionResult> {
    try {
      await changeEnrollmentStatus(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.enrollmentStatusChangeError }
      return { ok: false, message: uk.students.enrollmentStatusChangeError }
    }
  }

  async function submitSearchGuardians(query: string) {
    if (!classId) return []
    return searchGuardians(classId, query)
  }

  async function submitLinkGuardian(raw: unknown): Promise<ActionResult> {
    try {
      await linkGuardian(id, raw)
      return { ok: true }
    } catch (err) {
      if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? uk.students.linkError }
      if (err instanceof ConflictError) return { ok: false, message: uk.students.guardianAlreadyLinked }
      return { ok: false, message: uk.students.linkError }
    }
  }

  async function submitUnlinkGuardian(guardianshipId: string): Promise<ActionResult> {
    try {
      await unlinkGuardian(id, guardianshipId)
      return { ok: true }
    } catch {
      return { ok: false, message: uk.students.unlinkError }
    }
  }

  async function submitUpdateHealth(raw: unknown): Promise<ActionResult> {
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

  async function submitUpdateHealthNote(raw: unknown): Promise<ActionResult> {
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
      <h1 className="text-xl font-semibold">
        {student.lastName} {student.firstName}
      </h1>

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
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{uk.students.class}:</span>
              <ClassAssign
                currentClassName={className}
                availableClasses={availableClasses}
                assignAction={submitAssignClass}
              />
            </div>
            <StudentInfoSection
              firstName={student.firstName}
              lastName={student.lastName}
              middleName={student.middleName}
              bornOn={student.bornOn}
              livingAddress={student.livingAddress}
              criticalNote={student.criticalNote}
              parentalConsentGivenAt={student.parentalConsentGivenAt}
              consentEnteredById={student.parentalConsentEnteredBy}
              consentEnteredByName={consentEnteredByName}
              canEdit={canEdit}
              updateAction={submitUpdateStudent}
            />
            {/* Only meaningful while the student has an active enrollment —
                withdrawal/graduation/exclusion/academic leave close it and
                leave nothing to change further (CLAUDE.md §6: no permission,
                no active target -> the control doesn't render at all). */}
            {classId && (
              <div className="mt-3">
                <ChangeEnrollmentStatus canManage={canEdit} changeAction={submitChangeEnrollmentStatus} />
              </div>
            )}
          </section>

          <section className="py-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.guardians}</h2>
            <GuardiansSection
              guardians={guardians}
              canManage={canEdit}
              searchAction={submitSearchGuardians}
              linkAction={submitLinkGuardian}
              unlinkAction={submitUnlinkGuardian}
            />
          </section>

          <section className="py-4 last:pb-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{uk.students.measurements}</h2>
            {measurements.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {measurements.map((m) => (
                  <li key={m.id} className="flex gap-4">
                    <span className="text-muted-foreground">
                      {new Date(m.measuredOn).toLocaleDateString('uk-UA')}
                    </span>
                    <span>
                      {m.heightCm != null ? `${uk.students.heightCm}: ${m.heightCm}` : null}
                    </span>
                    <span>
                      {m.weightKg != null ? `${uk.students.weightKg}: ${m.weightKg}` : null}
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
