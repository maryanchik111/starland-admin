import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { ConflictError, EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import type { AdminAuthClient } from '../src/lib/users/supabase-admin-client.js'
import { createUserWithPermissions } from '../src/lib/users/create-user.js'

const createdAppUserIds: string[] = []

async function makeActor(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: email.split('@')[0] ?? email, email },
  })
  createdAppUserIds.push(appUser.id)
  return { authUserId, appUserId: appUser.id }
}

/**
 * Stubs only the Supabase Auth HTTP boundary (`AdminAuthClient`). Everything
 * downstream — app_users, user_roles, audit_logs — runs against the real
 * database, matching the project's "don't mock the database" convention.
 */
function fakeAdminAuth(): { client: AdminAuthClient; deletedUserIds: string[] } {
  const emails = new Set<string>()
  const deletedUserIds: string[] = []
  return {
    deletedUserIds,
    client: {
      async createUser({ email }) {
        if (emails.has(email)) {
          return { userId: null, errorMessage: 'A user with this email address has already been registered' }
        }
        emails.add(email)
        return { userId: randomUUID(), errorMessage: null }
      },
      async deleteUser(userId) {
        deletedUserIds.push(userId)
        return { errorMessage: null }
      },
    },
  }
}

afterEach(async () => {
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'app_users', entityId: id } })
    await prisma.userRole.deleteMany({ where: { userId: id } })
    await prisma.appUser.deleteMany({ where: { id } })
  }
})

describe('createUserWithPermissions', () => {
  it('throws ForbiddenError without users.write', async () => {
    const actor = await makeActor(`no-perm-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([])
    const { client } = fakeAdminAuth()

    await expect(
      createUserWithPermissions(
        permissions,
        actor,
        {
          fullName: 'Новий Користувач',
          email: `blocked-${randomUUID()}@admin-starland.test`,
          roleCode: 'secretary',
          temporaryPassword: 'a-very-long-password',
        },
        { adminAuth: client },
      ),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates the app user, assigns the role, and audits the actor without PII', async () => {
    const actor = await makeActor(`director-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([{ permissionCode: 'users.write', scopeType: 'global', scopeId: null }])
    const { client } = fakeAdminAuth()
    const email = `new-user-${randomUUID()}@admin-starland.test`

    const result = await createUserWithPermissions(
      permissions,
      actor,
      { fullName: 'Нова Секретарка', email, roleCode: 'secretary', temporaryPassword: 'a-very-long-password' },
      { adminAuth: client },
    )
    createdAppUserIds.push(result.id)

    const created = await prisma.appUser.findUniqueOrThrow({ where: { id: result.id } })
    expect(created.email).toBe(email)
    expect(created.isActive).toBe(true)

    const roles = await prisma.userRole.findMany({ where: { userId: result.id }, include: { role: true } })
    expect(roles).toHaveLength(1)
    expect(roles[0]?.role.code).toBe('secretary')
    expect(roles[0]?.grantedBy).toBe(actor.appUserId)

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'app_users', entityId: result.id, action: 'INSERT' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.userId).toBe(actor.appUserId)
    expect(JSON.stringify(logs[0]?.newValues)).not.toContain(email)
    expect(JSON.stringify(logs[0]?.newValues)).not.toContain('Нова Секретарка')
  })

  it('throws NotFoundError for an unknown role and never calls the Admin API', async () => {
    const actor = await makeActor(`director-role-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([{ permissionCode: 'users.write', scopeType: 'global', scopeId: null }])
    let createUserCalled = false
    const client: AdminAuthClient = {
      async createUser() {
        createUserCalled = true
        return { userId: randomUUID(), errorMessage: null }
      },
      async deleteUser() {
        return { errorMessage: null }
      },
    }

    await expect(
      createUserWithPermissions(
        permissions,
        actor,
        {
          fullName: 'Хтось',
          email: `orphan-guard-${randomUUID()}@admin-starland.test`,
          roleCode: 'does-not-exist',
          temporaryPassword: 'a-very-long-password',
        },
        { adminAuth: client },
      ),
    ).rejects.toThrow(NotFoundError)
    expect(createUserCalled).toBe(false)
  })

  it('throws ConflictError on duplicate email', async () => {
    const actor = await makeActor(`director-dup-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([{ permissionCode: 'users.write', scopeType: 'global', scopeId: null }])
    const { client } = fakeAdminAuth()
    const email = `dup-${randomUUID()}@admin-starland.test`

    const first = await createUserWithPermissions(
      permissions,
      actor,
      { fullName: 'Перший', email, roleCode: 'secretary', temporaryPassword: 'a-very-long-password' },
      { adminAuth: client },
    )
    createdAppUserIds.push(first.id)

    await expect(
      createUserWithPermissions(
        permissions,
        actor,
        { fullName: 'Другий', email, roleCode: 'secretary', temporaryPassword: 'a-very-long-password' },
        { adminAuth: client },
      ),
    ).rejects.toThrow(ConflictError)
  })

  it('compensates with a best-effort auth-user delete when the Prisma step fails', async () => {
    const actor = await makeActor(`director-compensate-${randomUUID()}@admin-starland.test`)
    const permissions = new EffectivePermissions([{ permissionCode: 'users.write', scopeType: 'global', scopeId: null }])
    const { client, deletedUserIds } = fakeAdminAuth()
    const email = `compensate-${randomUUID()}@admin-starland.test`

    // Pre-seed an app_users row with the same email but a different auth id,
    // so the Admin API call (fake) succeeds while the Prisma insert hits the
    // real unique constraint on app_users.email.
    const existing = await prisma.appUser.create({
      data: { authUserId: randomUUID(), fullName: 'Вже Існує', email },
    })
    createdAppUserIds.push(existing.id)

    await expect(
      createUserWithPermissions(
        permissions,
        actor,
        { fullName: 'Не Пройде', email, roleCode: 'secretary', temporaryPassword: 'a-very-long-password' },
        { adminAuth: client },
      ),
    ).rejects.toThrow()

    expect(deletedUserIds).toHaveLength(1)
  })
})
