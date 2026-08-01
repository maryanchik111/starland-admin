import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { createAuthUser } from './rls-harness.js'

async function scopesOf(userId: string) {
  return prisma.$queryRaw<Array<{ permission_code: string; scope_type: string }>>`
    select permission_code, scope_type from user_effective_scopes where user_id = ${userId}::uuid
  `
}

describe('user_effective_scopes', () => {
  let directorUserId: string

  beforeEach(async () => {
    const authId = await createAuthUser(`director-${Date.now()}@starland.test`)
    directorUserId = (await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })).id
  })

  it('expands a global role into global scopes', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })

    const scopes = await scopesOf(directorUserId)
    expect(scopes.some((s) => s.permission_code === 'students.read' && s.scope_type === 'global')).toBe(true)
  })

  it('removes scopes when the role is taken away', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    const link = await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })
    await prisma.userRole.delete({ where: { id: link.id } })

    expect(await scopesOf(directorUserId)).toHaveLength(0)
  })

  it('lets a deny grant override an allow from a role', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })

    await prisma.permissionGrant.create({
      data: {
        userId: directorUserId, permissionId: permission.id, effect: 'deny',
        scopeType: 'global', reason: 'Тимчасове обмеження на час перевірки',
        grantedBy: directorUserId,
      },
    })

    const scopes = await scopesOf(directorUserId)
    expect(scopes.some((s) => s.permission_code === 'audit.read')).toBe(false)
    expect(scopes.some((s) => s.permission_code === 'students.read')).toBe(true)
  })

  it('ignores an expired allow grant', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })
    await prisma.permissionGrant.create({
      data: {
        userId: directorUserId, permissionId: permission.id, effect: 'allow',
        scopeType: 'global', reason: 'Доступ на час аудиту', grantedBy: directorUserId,
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    expect(await scopesOf(directorUserId)).toHaveLength(0)
  })
})
