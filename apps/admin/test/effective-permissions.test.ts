import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma, withUserContext } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { getEffectivePermissionsProfile } from '../src/lib/users/effective-permissions.js'

const createdAppUserIds: string[] = []
const createdClassIds: string[] = []
const createdYearIds: string[] = []

async function makeUser(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: email.split('@')[0] ?? email, email },
  })
  createdAppUserIds.push(appUser.id)
  return { authUserId, appUserId: appUser.id }
}

async function assignActiveRole(userId: string, roleCode: string, grantedBy: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId, roleId: role.id, grantedBy } })
}

/**
 * `getEffectivePermissionsProfile` now reads through `withUserContext`
 * (RLS), so the acting user needs real global `users.read` on their own
 * `user_effective_scopes` row for the *_read_all policies to let them see
 * the target's rows — not just the synthetic EffectivePermissions object
 * passed for the in-process `requirePermission` check. `director` carries
 * both `users.read` and `classes.read`/`staff.read` (needed for the
 * mentor_classes/own_teaching scope expansion), so it covers every case
 * here without a bespoke role.
 */
async function makeDirectorActor(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const actor = await makeUser(email)
  await assignActiveRole(actor.appUserId, 'director', actor.appUserId)
  return actor
}

const usersReadPermissions = new EffectivePermissions([
  { permissionCode: 'users.read', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdClassIds.length > 0) {
    const id = createdClassIds.pop()
    if (!id) continue
    await prisma.class.deleteMany({ where: { id } })
  }
  while (createdYearIds.length > 0) {
    const id = createdYearIds.pop()
    if (!id) continue
    await prisma.academicYear.deleteMany({ where: { id } })
  }
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    await prisma.permissionGrant.deleteMany({ where: { userId: id } })
    await prisma.userRole.deleteMany({ where: { userId: id } })
    await prisma.appUser.deleteMany({ where: { id } })
  }
})

describe('getEffectivePermissionsProfile', () => {
  it('throws ForbiddenError without users.read', async () => {
    const actor = await makeDirectorActor(`profile-noperm-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-noperm-${randomUUID()}@admin-starland.test`)
    await expect(
      withUserContext(actor.authUserId, (tx) =>
        getEffectivePermissionsProfile(tx, new EffectivePermissions([]), { userId: target.appUserId }),
      ),
    ).rejects.toThrow(ForbiddenError)
  })

  it('attributes a global permission to the role that grants it', async () => {
    const actor = await makeDirectorActor(`profile-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-secretary-${randomUUID()}@admin-starland.test`)
    await assignActiveRole(target.appUserId, 'secretary', actor.appUserId)

    const rows = await withUserContext(actor.authUserId, (tx) =>
      getEffectivePermissionsProfile(tx, usersReadPermissions, { userId: target.appUserId }),
    )

    const row = rows.find((r) => r.permissionCode === 'students.read' && r.scopeType === 'global')
    expect(row).toBeDefined()
    expect(row?.origins).toHaveLength(1)
    expect(row?.origins[0]).toMatchObject({ type: 'role', roleCode: 'secretary' })
  })

  it('attributes a personal allow grant to the grant that produced it', async () => {
    const actor = await makeDirectorActor(`profile-grant-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-grant-target-${randomUUID()}@admin-starland.test`)
    const permission = await prisma.permission.findFirstOrThrow({ where: { code: 'audit.read' } })
    await prisma.permissionGrant.create({
      data: {
        userId: target.appUserId,
        permissionId: permission.id,
        effect: 'allow',
        scopeType: 'global',
        reason: 'test fixture',
        grantedBy: actor.appUserId,
      },
    })

    const rows = await withUserContext(actor.authUserId, (tx) =>
      getEffectivePermissionsProfile(tx, usersReadPermissions, { userId: target.appUserId }),
    )

    const row = rows.find((r) => r.permissionCode === 'audit.read' && r.scopeType === 'global')
    expect(row).toBeDefined()
    expect(row?.origins).toHaveLength(1)
    expect(row?.origins[0]).toMatchObject({ type: 'grant', reason: 'test fixture' })
  })

  it('does not surface a permission a deny grant removed', async () => {
    const actor = await makeDirectorActor(`profile-deny-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-deny-target-${randomUUID()}@admin-starland.test`)
    await assignActiveRole(target.appUserId, 'secretary', actor.appUserId)
    const permission = await prisma.permission.findFirstOrThrow({ where: { code: 'students.read' } })
    await prisma.permissionGrant.create({
      data: {
        userId: target.appUserId,
        permissionId: permission.id,
        effect: 'deny',
        scopeType: 'global',
        reason: 'test fixture deny',
        grantedBy: actor.appUserId,
      },
    })

    const rows = await withUserContext(actor.authUserId, (tx) =>
      getEffectivePermissionsProfile(tx, usersReadPermissions, { userId: target.appUserId }),
    )
    expect(rows.find((r) => r.permissionCode === 'students.read' && r.scopeType === 'global')).toBeUndefined()
  })

  it('attributes a mentor_classes-scoped permission to the class the user mentors', async () => {
    const actor = await makeDirectorActor(`profile-mentor-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-mentor-target-${randomUUID()}@admin-starland.test`)
    const year = await prisma.academicYear.create({
      data: { name: `Y-profile-${randomUUID()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    createdYearIds.push(year.id)
    const cls = await prisma.class.create({
      data: {
        academicYearId: year.id,
        gradeLevel: 3,
        name: `3-П-${randomUUID().slice(0, 8)}`,
        mentorUserId: target.appUserId,
      },
    })
    createdClassIds.push(cls.id)
    await assignActiveRole(target.appUserId, 'mentor', actor.appUserId)

    const rows = await withUserContext(actor.authUserId, (tx) =>
      getEffectivePermissionsProfile(tx, usersReadPermissions, { userId: target.appUserId }),
    )

    const row = rows.find(
      (r) => r.permissionCode === 'students.read' && r.scopeType === 'class' && r.scopeId === cls.id,
    )
    expect(row).toBeDefined()
    expect(row?.origins[0]).toMatchObject({ type: 'role', roleCode: 'mentor' })
  })

  it('no longer attributes a permission once its role is revoked', async () => {
    const actor = await makeDirectorActor(`profile-revoke-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`profile-revoke-target-${randomUUID()}@admin-starland.test`)
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'secretary' } })
    const userRole = await prisma.userRole.create({
      data: { userId: target.appUserId, roleId: role.id, grantedBy: actor.appUserId },
    })
    await prisma.userRole.update({
      where: { id: userRole.id },
      data: { revokedAt: new Date(), revokedBy: actor.appUserId },
    })

    const rows = await withUserContext(actor.authUserId, (tx) =>
      getEffectivePermissionsProfile(tx, usersReadPermissions, { userId: target.appUserId }),
    )
    expect(rows.find((r) => r.permissionCode === 'students.read')).toBeUndefined()
  })
})
