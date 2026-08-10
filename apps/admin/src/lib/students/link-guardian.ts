import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, ConflictError, NotFoundError, type EffectivePermissions } from '@starland/domain'

const RelationDetails = z.object({
  relation: z.string().trim().min(1, 'relation must not be empty'),
  isLegalRepresentative: z.boolean().optional().default(false),
  canPickUp: z.boolean().optional().default(true),
  receivesNotifications: z.boolean().optional().default(true),
})

const NewGuardianPerson = z
  .object({
    mode: z.literal('new'),
    firstName: z.string().trim().min(1, 'firstName must not be empty'),
    lastName: z.string().trim().min(1, 'lastName must not be empty'),
    middleName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
  })
  .merge(RelationDetails)

const ExistingGuardianPerson = z
  .object({
    mode: z.literal('existing'),
    personId: z.string().uuid('personId must be a valid UUID'),
  })
  .merge(RelationDetails)

export const LinkGuardianInput = z.discriminatedUnion('mode', [NewGuardianPerson, ExistingGuardianPerson])

export type LinkGuardianInput = z.infer<typeof LinkGuardianInput>

/**
 * Чиста логіка без Next.js — саме її покривають тести.
 *
 * `guardianships` has a full (not partial) unique constraint on
 * `(studentId, personId)` — unlike `user_roles`, there is no room for a
 * second row once one exists. Re-linking a previously unlinked pair must
 * therefore resurrect the same row (`deletedAt = null`), not insert a new
 * one, or the unique constraint rejects it.
 */
export async function linkGuardianWithPermissions(
  permissions: EffectivePermissions,
  actor: { authUserId: string },
  target: { studentId: string; classId: string },
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(permissions, 'students.write', { type: 'class', id: target.classId })
  const input = LinkGuardianInput.parse(raw)

  const relationData = {
    relation: input.relation,
    isLegalRepresentative: input.isLegalRepresentative,
    canPickUp: input.canPickUp,
    receivesNotifications: input.receivesNotifications,
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: actor.authUserId,
      role: 'authenticated',
    })}, true)`

    let personId: string
    if (input.mode === 'new') {
      const person = await tx.guardianPerson.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          phone: input.phone,
          email: input.email,
        },
      })
      personId = person.id
    } else {
      const person = await tx.guardianPerson.findUnique({ where: { id: input.personId } })
      if (!person || person.deletedAt) throw new NotFoundError('guardian person', input.personId)
      personId = person.id
    }

    const existing = await tx.guardianship.findUnique({
      where: { studentId_personId: { studentId: target.studentId, personId } },
    })
    if (existing) {
      if (!existing.deletedAt) {
        throw new ConflictError('Guardian is already linked to this student')
      }
      const relinked = await tx.guardianship.update({
        where: { id: existing.id },
        data: { ...relationData, deletedAt: null },
      })
      return { id: relinked.id }
    }

    const created = await tx.guardianship.create({
      data: { studentId: target.studentId, personId, ...relationData },
    })
    return { id: created.id }
  })
}
