import { prisma } from '@starland/db'
import { EffectivePermissions, type EffectiveScope, type ScopeType } from './permissions'

export async function loadEffectivePermissions(userId: string): Promise<EffectivePermissions> {
  const rows = await prisma.userEffectiveScope.findMany({
    where: { userId },
    select: { permissionCode: true, scopeType: true, scopeId: true },
  })
  const scopes: EffectiveScope[] = rows.map((r) => ({
    permissionCode: r.permissionCode,
    scopeType: r.scopeType as ScopeType,
    scopeId: r.scopeId,
  }))
  return new EffectivePermissions(scopes)
}
