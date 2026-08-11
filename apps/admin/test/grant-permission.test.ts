import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { grantPermissionWithPermissions, revokePermissionGrantWithPermissions } from '../src/lib/users/grant-permission.js'

const createdAppUserIds: string[] = []
const createdGrantIds: string[] = []

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
  while (createdGrantIds.length > 0) {
    const id = createdGrantIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'permission_grants', entityId: id } })
    await prisma.permissionGrant.deleteMany({ where: { id } })
  }
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    await prisma.appUser.deleteMany({ where: { id } })
  }
})

describe('grantPermissionWithPermissions', () => {
  it('throws ForbiddenError without roles.manage', async () => {
    const actor = await makeUser(`grant-no-perm-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`grant-target-${randomUUID()}@admin-starland.test`)
    await expect(
      grantPermissionWithPermissions(new EffectivePermissions([]), actor, { userId: target.appUserId }, {
        permissionCode: 'audit.read',
        reason: 'Тимчасовий доступ на час відпустки колеги',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError for an unknown permission code', async () => {
    const actor = await makeUser(`grant-404-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`grant-404-target-${randomUUID()}@admin-starland.test`)
    await expect(
      grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        permissionCode: 'does-not-exist',
        reason: 'Тимчасовий доступ на час відпустки колеги',
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('rejects a reason shorter than 10 characters', async () => {
    const actor = await makeUser(`grant-short-reason-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`grant-short-reason-target-${randomUUID()}@admin-starland.test`)
    await expect(
      grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        permissionCode: 'audit.read',
        reason: 'коротко',
      }),
    ).rejects.toThrow()
  })

  it('rejects an expiresAt in the past', async () => {
    const actor = await makeUser(`grant-past-expiry-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`grant-past-expiry-target-${randomUUID()}@admin-starland.test`)
    await expect(
      grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        permissionCode: 'audit.read',
        reason: 'Тимчасовий доступ на час відпустки колеги',
        expiresAt: new Date('2020-01-01').toISOString(),
      }),
    ).rejects.toThrow()
  })

  it('creates a global allow grant with grantedBy set and records an audit log entry', async () => {
    const actor = await makeUser(`grant-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`grant-target-ok-${randomUUID()}@admin-starland.test`)

    const result = await grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      permissionCode: 'audit.read',
      reason: 'Тимчасовий доступ на час відпустки колеги',
    })
    createdGrantIds.push(result.id)

    const row = await prisma.permissionGrant.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.userId).toBe(target.appUserId)
    expect(row.effect).toBe('allow')
    expect(row.scopeType).toBe('global')
    expect(row.grantedBy).toBe(actor.appUserId)
    expect(row.revokedAt).toBeNull()

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'permission_grants', entityId: result.id, action: 'INSERT' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.appUserId)
  })
})

describe('revokePermissionGrantWithPermissions', () => {
  it('throws ForbiddenError without roles.manage', async () => {
    const actor = await makeUser(`revoke-grant-no-perm-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-grant-target-${randomUUID()}@admin-starland.test`)
    const created = await grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      permissionCode: 'audit.read',
      reason: 'Тимчасовий доступ на час відпустки колеги',
    })
    createdGrantIds.push(created.id)

    await expect(
      revokePermissionGrantWithPermissions(new EffectivePermissions([]), actor, { userId: target.appUserId }, {
        grantId: created.id,
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('throws NotFoundError for an unknown grant', async () => {
    const actor = await makeUser(`revoke-grant-404-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-grant-404-target-${randomUUID()}@admin-starland.test`)
    await expect(
      revokePermissionGrantWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
        grantId: randomUUID(),
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('sets revokedAt/revokedBy', async () => {
    const actor = await makeUser(`revoke-grant-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`revoke-grant-target-ok-${randomUUID()}@admin-starland.test`)
    const created = await grantPermissionWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      permissionCode: 'audit.read',
      reason: 'Тимчасовий доступ на час відпустки колеги',
    })
    createdGrantIds.push(created.id)

    await revokePermissionGrantWithPermissions(rolesManagePermissions, actor, { userId: target.appUserId }, {
      grantId: created.id,
    })

    const row = await prisma.permissionGrant.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.revokedAt).not.toBeNull()
    expect(row.revokedBy).toBe(actor.appUserId)
  })
})
