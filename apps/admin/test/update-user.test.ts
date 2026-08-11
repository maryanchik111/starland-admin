import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { updateUserWithPermissions } from '../src/lib/users/update-user.js'

const createdAppUserIds: string[] = []

async function makeUser(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: 'Стара Назва', email },
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
      console.warn(`update-user.test.ts: cleanup failed for app_user ${id}`, err)
    }
  }
})

describe('updateUserWithPermissions', () => {
  it('throws ForbiddenError without users.write', async () => {
    const target = await makeUser(`update-no-perm-${randomUUID()}@admin-starland.test`)
    await expect(
      updateUserWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { userId: target.appUserId }, {
        fullName: 'Нова Назва',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('updates fullName and audits the actor, not NULL', async () => {
    const actor = await makeUser(`update-actor-${randomUUID()}@admin-starland.test`)
    const target = await makeUser(`update-target-${randomUUID()}@admin-starland.test`)

    await updateUserWithPermissions(usersWritePermissions, { authUserId: actor.authUserId }, { userId: target.appUserId }, {
      fullName: 'Марія Директорівна',
    })

    const row = await prisma.appUser.findUniqueOrThrow({ where: { id: target.appUserId } })
    expect(row.fullName).toBe('Марія Директорівна')

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'app_users', entityId: target.appUserId, action: 'UPDATE' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.appUserId)
  })

  it('rejects an empty fullName', async () => {
    const target = await makeUser(`update-empty-${randomUUID()}@admin-starland.test`)
    await expect(
      updateUserWithPermissions(usersWritePermissions, { authUserId: randomUUID() }, { userId: target.appUserId }, {
        fullName: '   ',
      }),
    ).rejects.toThrow()
  })
})
