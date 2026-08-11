import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

/**
 * `permission_grants` and `user_effective_scopes` currently only have
 * self-scoped SELECT policies (`permission_grants_own`,
 * `user_effective_scopes_own` — see `20260731221731_permissions_model` and
 * `20260731235703_user_effective_scopes`). Task 8's "effective permissions"
 * profile screen needs a director with global `users.read` to read another
 * user's rows on both tables — same shape as `app_users_read_all` /
 * `user_roles_read_all` from Task 5.
 *
 * Every row this file creates is tracked and removed in `afterEach` — see
 * `rls-harness.test.ts`'s convention. `createAuthUser` deliberately does not
 * clean up after itself; a director/roles.manage row left behind here would
 * silently inflate every other suite's "how many active holders exist
 * system-wide" guard checks in the shared dev database.
 */
const createdAuthUserIds: string[] = []
const createdStudentIds: string[] = []

async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  createdAuthUserIds.push(authId)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    try {
      await prisma.linkedAccount.deleteMany({ where: { studentId: id } })
      await prisma.student.deleteMany({ where: { id } })
    } catch (err) {
      console.warn(`access-scope-read-policy.test.ts: cleanup failed for student ${id}`, err)
    }
  }
  while (createdAuthUserIds.length > 0) {
    const authId = createdAuthUserIds.pop()
    if (!authId) continue
    try {
      const user = await prisma.appUser.findFirst({ where: { authUserId: authId } })
      if (user) {
        await prisma.permissionGrant.deleteMany({ where: { userId: user.id } })
        await prisma.userRole.deleteMany({ where: { userId: user.id } })
      }
      await prisma.appUser.deleteMany({ where: { authUserId: authId } })
      await prisma.$executeRaw`delete from auth.users where id = ${authId}::uuid`
    } catch (err) {
      console.warn(`access-scope-read-policy.test.ts: cleanup failed for auth user ${authId}`, err)
    }
  }
})

describe('permission_grants_read_all', () => {
  it('lets a user with global users.read scope see another user\'s permission_grants rows', async () => {
    const director = await makeUserWithRole(`grantsread-${Date.now()}@starland.test`, 'director')
    const other = await makeUserWithRole(`grantstarget-${Date.now()}@starland.test`, 'secretary')
    const permission = await prisma.permission.findFirstOrThrow({ where: { code: 'grades.write' } })
    const grant = await prisma.permissionGrant.create({
      data: {
        userId: other.userId,
        permissionId: permission.id,
        effect: 'allow',
        scopeType: 'global',
        reason: 'test fixture',
        grantedBy: director.userId,
      },
    })

    const visible = await asUser(director.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from permission_grants where id = ${grant.id}::uuid`
    })
    expect(visible).toHaveLength(1)
  })

  it('hides other permission_grants rows from a user without users.read, but still shows their own', async () => {
    const secretary = await makeUserWithRole(`nograntsread-${Date.now()}@starland.test`, 'secretary')
    const other = await makeUserWithRole(`grantstarget2-${Date.now()}@starland.test`, 'secretary')
    const permission = await prisma.permission.findFirstOrThrow({ where: { code: 'grades.write' } })
    const grant = await prisma.permissionGrant.create({
      data: {
        userId: other.userId,
        permissionId: permission.id,
        effect: 'allow',
        scopeType: 'global',
        reason: 'test fixture',
        grantedBy: other.userId,
      },
    })
    const ownGrant = await prisma.permissionGrant.create({
      data: {
        userId: secretary.userId,
        permissionId: permission.id,
        effect: 'allow',
        scopeType: 'global',
        reason: 'test fixture',
        grantedBy: secretary.userId,
      },
    })

    const visibleOther = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from permission_grants where id = ${grant.id}::uuid`
    })
    expect(visibleOther).toHaveLength(0)

    const visibleSelf = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from permission_grants where id = ${ownGrant.id}::uuid`
    })
    expect(visibleSelf).toHaveLength(1)
  })
})

describe('linked_accounts_read_all', () => {
  it('lets a user with global users.read scope see another user\'s linked_accounts rows', async () => {
    const director = await makeUserWithRole(`linksread-${Date.now()}@starland.test`, 'director')
    const other = await makeUserWithRole(`linkstarget-${Date.now()}@starland.test`, 'student_family')
    const student = await prisma.student.create({
      data: { firstName: 'Звʼязок', lastName: 'Тест', bornOn: new Date('2016-01-01') },
    })
    createdStudentIds.push(student.id)
    const link = await prisma.linkedAccount.create({
      data: { ownerUserId: other.userId, studentId: student.id, linkedBy: director.userId },
    })

    const visible = await asUser(director.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from linked_accounts where id = ${link.id}::uuid`
    })
    expect(visible).toHaveLength(1)
  })

  it('hides other linked_accounts rows from a user without users.read, but still shows their own', async () => {
    const secretary = await makeUserWithRole(`nolinksread-${Date.now()}@starland.test`, 'secretary')
    const other = await makeUserWithRole(`linkstarget2-${Date.now()}@starland.test`, 'student_family')
    const student = await prisma.student.create({
      data: { firstName: 'Звʼязок2', lastName: 'Тест2', bornOn: new Date('2016-01-01') },
    })
    createdStudentIds.push(student.id)
    const otherLink = await prisma.linkedAccount.create({
      data: { ownerUserId: other.userId, studentId: student.id, linkedBy: other.userId },
    })
    const ownLink = await prisma.linkedAccount.create({
      data: { ownerUserId: secretary.userId, studentId: student.id, linkedBy: secretary.userId },
    })

    const visibleOther = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from linked_accounts where id = ${otherLink.id}::uuid`
    })
    expect(visibleOther).toHaveLength(0)

    const visibleSelf = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from linked_accounts where id = ${ownLink.id}::uuid`
    })
    expect(visibleSelf).toHaveLength(1)
  })
})

describe('user_effective_scopes_read_all', () => {
  it('lets a user with global users.read scope see another user\'s effective scopes', async () => {
    const director = await makeUserWithRole(`scopesread-${Date.now()}@starland.test`, 'director')
    const other = await makeUserWithRole(`scopestarget-${Date.now()}@starland.test`, 'secretary')

    const visible = await asUser(director.authId, async (tx) => {
      return tx.$queryRaw<Array<{ user_id: string }>>`select user_id from user_effective_scopes where user_id = ${other.userId}::uuid`
    })
    expect(visible.length).toBeGreaterThan(0)
  })

  it('hides other user_effective_scopes rows from a user without users.read, but still shows their own', async () => {
    const secretary = await makeUserWithRole(`noscopesread-${Date.now()}@starland.test`, 'secretary')
    const other = await makeUserWithRole(`scopestarget2-${Date.now()}@starland.test`, 'secretary')

    const visibleOther = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ user_id: string }>>`select user_id from user_effective_scopes where user_id = ${other.userId}::uuid`
    })
    expect(visibleOther).toHaveLength(0)

    const visibleSelf = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ user_id: string }>>`select user_id from user_effective_scopes where user_id = ${secretary.userId}::uuid`
    })
    expect(visibleSelf.length).toBeGreaterThan(0)
  })
})
