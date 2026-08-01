import { prisma } from '../../src/index.js'
import { PERMISSIONS } from './permissions.js'
import { ROLES } from './roles.js'
import { SETTINGS } from './settings.js'

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code: p.code }, update: p, create: p })
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, isSystem: true },
      create: { code: r.code, name: r.name, isSystem: true },
    })

    for (const rp of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: rp.code } })
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId_scopeKind: {
            roleId: role.id, permissionId: permission.id, scopeKind: rp.scope,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id, scopeKind: rp.scope },
      })
    }
  }

  for (const [key, s] of Object.entries(SETTINGS)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { description: s.description },
      create: { key, value: s.value, description: s.description },
    })
  }
}

main().finally(() => prisma.$disconnect())
