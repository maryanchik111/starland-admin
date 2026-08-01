import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

describe('scope helpers', () => {
  it('resolves the app user behind the current auth session', async () => {
    const authId = await createAuthUser(`helper-${Date.now()}@starland.test`)
    const expected = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })

    const actual = await asUser(authId, async (c) => {
      const r = await c.$queryRaw<{ current_app_user_id: string }[]>`select current_app_user_id()`
      return r[0]?.current_app_user_id
    })

    expect(actual).toBe(expected.id)
  })

  it('reports false when the projection has no matching row', async () => {
    const authId = await createAuthUser(`noscope-${Date.now()}@starland.test`)

    const allowed = await asUser(authId, async (c) => {
      const r = await c.$queryRaw<{ has_scope: boolean }[]>`
        select has_scope('students.read', 'global'::scope_type) as has_scope
      `
      return r[0]?.has_scope
    })

    expect(allowed).toBe(false)
  })

  it('reports true once a matching scope row exists', async () => {
    const authId = await createAuthUser(`scoped-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${user.id}::uuid, 'students.read', 'global'::scope_type, null, now(), now())
    `

    const allowed = await asUser(authId, async (c) => {
      const r = await c.$queryRaw<{ has_scope: boolean }[]>`
        select has_scope('students.read', 'global'::scope_type) as has_scope
      `
      return r[0]?.has_scope
    })

    expect(allowed).toBe(true)
  })
})
