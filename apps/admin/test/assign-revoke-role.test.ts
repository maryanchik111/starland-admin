import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { assignRoleWithPermissions } from '../src/lib/users/assign-role.js'
import { revokeRoleTx, revokeRoleWithPermissions } from '../src/lib/users/revoke-role.js'

const createdAppUserIds: string[] = []

async function makeUser(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: email.split('@')[0] ?? email, email },
  })
  createdAppUserIds.push(appUser.id)
  return { authUserId, appUserId: appUser.id }
}

const rolesManagePermissions = new EffectivePermissions([
  { permissionCode: 'roles.manage', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'user_roles', entityId: { in: await userRoleIdsFor(id) } } })
    await prisma.userRole.deleteMany({ where: { userId: id } })
    await prisma.appUser.deleteMany({ where: { id } })
  }
})

async function userRoleIdsFor(userId: string): Promise<string[]> {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { id: true } })
  return rows.map((r) => r.id)
}

describe('assignRoleWithPermissions', () => {
  it('throws ForbiddenError without roles.manage', async () => {
    const actor = await makeUser(`assign-no-perm-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`assign-target-${randomUUID()}@admin-starland.test`)
    await expect(
      assignRoleWithPermissions(new EffectivePermissions([]), actor, { userId: target.appUserId }, {
        roleCode: 'secretary',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates an active user_role with grantedBy set', async () => {
    const actor = await makeUser(`assign-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`assign-target-${randomUUID()}@admin-starland.test`)

    const result = await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })

    const row = await prisma.userRole.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.userId).toBe(target.appUserId)
    expect(row.grantedBy).toBe(actor.appUserId)
    expect(row.revokedAt).toBeNull()
  })

  it('throws NotFoundError for an unknown role', async () => {
    const actor = await makeUser(`assign-role-404-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`assign-role-404-target-${randomUUID()}@admin-starland.test`)
    await expect(
      assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        roleCode: 'does-not-exist',
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('throws ConflictError when the user already actively holds the role', async () => {
    const actor = await makeUser(`assign-dup-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`assign-dup-target-${randomUUID()}@admin-starland.test`)
    await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })
    await expect(
      assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        roleCode: 'secretary',
      }),
    ).rejects.toThrow(ConflictError)
  })

  it('allows re-assigning a role after it was revoked (soft-revoke, not delete)', async () => {
    const actor = await makeUser(`assign-reassign-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`assign-reassign-target-${randomUUID()}@admin-starland.test`)
    await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })
    await revokeRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })

    const result = await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })
    const row = await prisma.userRole.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.revokedAt).toBeNull()
  })
})

describe('revokeRoleWithPermissions', () => {
  it('throws ForbiddenError without roles.manage', async () => {
    const actor = await makeUser(`revoke-no-perm-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-no-perm-target-${randomUUID()}@admin-starland.test`)
    await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })
    await expect(
      revokeRoleWithPermissions(new EffectivePermissions([]), actor, { userId: target.appUserId }, {
        roleCode: 'secretary',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError when there is no active assignment of that role', async () => {
    const actor = await makeUser(`revoke-404-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-404-target-${randomUUID()}@admin-starland.test`)
    await expect(
      revokeRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        roleCode: 'secretary',
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('sets revokedAt/revokedBy and removes the permission from user_effective_scopes', async () => {
    const actor = await makeUser(`revoke-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-target-${randomUUID()}@admin-starland.test`)
    await assignRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })
    const before = await prisma.userEffectiveScope.findMany({
      where: { userId: target.appUserId, permissionCode: 'students.read' },
    })
    expect(before.length).toBeGreaterThan(0)

    await revokeRoleWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      roleCode: 'secretary',
    })

    const row = await prisma.userRole.findFirstOrThrow({ where: { userId: target.appUserId, role: { code: 'secretary' } } })
    expect(row.revokedAt).not.toBeNull()
    expect(row.revokedBy).toBe(actor.appUserId)

    const after = await prisma.userEffectiveScope.findMany({
      where: { userId: target.appUserId, permissionCode: 'students.read' },
    })
    expect(after).toHaveLength(0)
  })

  /**
   * The "never leave the system with zero roles.manage holders" guard is
   * inherently system-wide, and this suite runs against the real shared dev
   * database (project convention: no DB mocking), which already has a real
   * director account. Proving the guard fires when the count truly reaches
   * zero would otherwise mean permanently revoking that real account.
   *
   * Instead this drives revokeRoleTx directly inside a transaction, revokes
   * every *other* current roles.manage-global holder down to a single
   * test-created one, asserts the guard blocks revoking that last one, then
   * throws to force a rollback — so the real director and every other
   * account this test touches end up completely unchanged.
   */
  it('refuses to revoke the last active roles.manage holder in the system', async () => {
    const actor = await makeUser(`guard-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`guard-target-${randomUUID()}@admin-starland.test`)

    class Rollback extends Error {}

    await expect(
      prisma.$transaction(async (tx) => {
        const directorRole = await tx.role.findUniqueOrThrow({ where: { code: 'director' } })
        const lastHolder = await tx.userRole.create({
          data: { userId: target.appUserId, roleId: directorRole.id, grantedBy: actor.appUserId },
        })

        const otherHolders = await tx.userRole.findMany({
          where: {
            id: { not: lastHolder.id },
            revokedAt: null,
            role: { rolePermissions: { some: { scopeKind: 'global', permission: { code: 'roles.manage' } } } },
          },
        })
        for (const holder of otherHolders) {
          await tx.userRole.update({ where: { id: holder.id }, data: { revokedAt: new Date(), revokedBy: actor.appUserId } })
        }

        await expect(
          revokeRoleTx(tx, rolesManagePermissions, actor, { userId: target.appUserId }, { roleCode: 'director' }),
        ).rejects.toThrow(ConflictError)

        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)
  })
})
