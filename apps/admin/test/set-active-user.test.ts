import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError } from '@starland/domain'
import { setUserActiveWithPermissions } from '../src/lib/users/set-active.js'

const createdAppUserIds: string[] = []

async function makeUser(email: string, overrides: { isActive?: boolean } = {}): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: email.split('@')[0] ?? email, email, isActive: overrides.isActive ?? true },
  })
  createdAppUserIds.push(appUser.id)
  return { authUserId, appUserId: appUser.id }
}

const usersWritePermissions = new EffectivePermissions([
  { permissionCode: 'users.write', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    try {
      await prisma.auditLog.deleteMany({ where: { entityType: 'app_users', entityId: id } })
      await prisma.appUser.deleteMany({ where: { id } })
    } catch (err) {
      console.warn(`set-active-user.test.ts: cleanup failed for app_user ${id}`, err)
    }
  }
})

describe('setUserActiveWithPermissions', () => {
  it('throws ForbiddenError without users.write', async () => {
    const actor = await makeUser(`deactivate-no-perm-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`deactivate-target-${randomUUID()}@admin-starland.test`)

    await expect(
      setUserActiveWithPermissions(new EffectivePermissions([]), actor, { userId: target.appUserId }, { isActive: false }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('deactivates the target user and audits the actor', async () => {
    const actor = await makeUser(`deactivate-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`deactivate-target-${randomUUID()}@admin-starland.test`)

    await setUserActiveWithPermissions(usersWritePermissions, actor, { userId: target.appUserId }, { isActive: false })

    const row = await prisma.appUser.findUniqueOrThrow({ where: { id: target.appUserId } })
    expect(row.isActive).toBe(false)

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'app_users', entityId: target.appUserId, action: 'UPDATE' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.appUserId)
  })

  it('reactivates a deactivated user', async () => {
    const actor = await makeUser(`reactivate-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`reactivate-target-${randomUUID()}@admin-starland.test`, { isActive: false })

    await setUserActiveWithPermissions(usersWritePermissions, actor, { userId: target.appUserId }, { isActive: true })

    const row = await prisma.appUser.findUniqueOrThrow({ where: { id: target.appUserId } })
    expect(row.isActive).toBe(true)
  })

  it('throws ConflictError when a user tries to deactivate themselves', async () => {
    const actor = await makeUser(`self-deactivate-${randomUUID()}@admin-starland.test`)

    await expect(
      setUserActiveWithPermissions(usersWritePermissions, actor, { userId: actor.appUserId }, { isActive: false }),
    ).rejects.toThrow(ConflictError)

    const row = await prisma.appUser.findUniqueOrThrow({ where: { id: actor.appUserId } })
    expect(row.isActive).toBe(true)
  })

  it('allows a user to reactivate their own account (only self-deactivation is forbidden)', async () => {
    const actor = await makeUser(`self-reactivate-${randomUUID()}@admin-starland.test`, { isActive: false })

    await setUserActiveWithPermissions(usersWritePermissions, actor, { userId: actor.appUserId }, { isActive: true })

    const row = await prisma.appUser.findUniqueOrThrow({ where: { id: actor.appUserId } })
    expect(row.isActive).toBe(true)
  })
})
