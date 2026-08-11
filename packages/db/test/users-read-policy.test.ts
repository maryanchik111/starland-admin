import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

/**
 * `app_users` and `user_roles` currently only have self-scoped SELECT
 * policies (`app_users_self_select`, `user_roles_own` — see
 * `20260731150013_init_app_users` and `20260731221731_permissions_model`):
 * a user can only see their own `app_users` row and their own `user_roles`
 * rows. There is no policy yet that lets a director with global
 * `users.read` see everyone else's rows — that is exactly what the new
 * `app_users_read_all` / `user_roles_read_all` policies (added by the
 * `users_read_policy` migration) are meant to prove.
 */
async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

describe('app_users_read_all', () => {
  it('lets a user with global users.read scope see every app_users row', async () => {
    // `director` carries `users.read` at `global` scope (see
    // packages/db/prisma/seed/roles.ts), so this exercises the real
    // production role, not a synthetic scope grant.
    const director = await makeUserWithRole(`usersread-${Date.now()}@starland.test`, 'director')
    const other = await createAuthUser(`otherappuser-${Date.now()}@starland.test`)
    const otherUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: other } })

    const visible = await asUser(director.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from app_users where id = ${otherUser.id}::uuid`
    })

    expect(visible).toHaveLength(1)
    expect(visible[0]?.id).toBe(otherUser.id)
  })

  it('hides other app_users rows from a user without users.read, but still shows their own row', async () => {
    // `secretary` has no `users.read` permission at all (see
    // packages/db/prisma/seed/roles.ts) — only `app_users_self_select`
    // should apply, so they see themselves but not the other user.
    const secretary = await makeUserWithRole(`nousersread-${Date.now()}@starland.test`, 'secretary')
    const other = await createAuthUser(`otherappuser2-${Date.now()}@starland.test`)
    const otherUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: other } })

    const visibleOther = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from app_users where id = ${otherUser.id}::uuid`
    })
    expect(visibleOther).toHaveLength(0)

    const visibleSelf = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from app_users where id = ${secretary.userId}::uuid`
    })
    expect(visibleSelf).toHaveLength(1)
    expect(visibleSelf[0]?.id).toBe(secretary.userId)
  })
})

describe('user_roles_read_all', () => {
  it('lets a user with global users.read scope see every user_roles row', async () => {
    const director = await makeUserWithRole(`rolesread-${Date.now()}@starland.test`, 'director')
    const other = await makeUserWithRole(`otherroleuser-${Date.now()}@starland.test`, 'secretary')

    const visible = await asUser(director.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string; user_id: string }>>`select id, user_id from user_roles where user_id = ${other.userId}::uuid`
    })

    expect(visible).toHaveLength(1)
    expect(visible[0]?.user_id).toBe(other.userId)
  })

  it('hides other user_roles rows from a user without users.read, but still shows their own', async () => {
    const secretary = await makeUserWithRole(`norolesread-${Date.now()}@starland.test`, 'secretary')
    const other = await makeUserWithRole(`otherroleuser2-${Date.now()}@starland.test`, 'secretary')

    const visibleOther = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string }>>`select id from user_roles where user_id = ${other.userId}::uuid`
    })
    expect(visibleOther).toHaveLength(0)

    const visibleSelf = await asUser(secretary.authId, async (tx) => {
      return tx.$queryRaw<Array<{ id: string; user_id: string }>>`select id, user_id from user_roles where user_id = ${secretary.userId}::uuid`
    })
    expect(visibleSelf).toHaveLength(1)
    expect(visibleSelf[0]?.user_id).toBe(secretary.userId)
  })
})
