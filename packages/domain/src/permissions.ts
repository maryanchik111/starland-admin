import { ForbiddenError } from './errors.js'

export type ScopeType = 'global' | 'class' | 'subject' | 'student' | 'teaching_assignment' | 'user'

export interface EffectiveScope {
  permissionCode: string
  scopeType: ScopeType
  scopeId: string | null
}

export interface ScopeRef {
  type: Exclude<ScopeType, 'global'>
  id: string
}

export class EffectivePermissions {
  private readonly index = new Map<string, Set<string>>()
  private readonly globals = new Set<string>()

  constructor(scopes: readonly EffectiveScope[]) {
    for (const s of scopes) {
      if (s.scopeType === 'global') {
        this.globals.add(s.permissionCode)
        continue
      }
      const key = `${s.permissionCode}:${s.scopeType}`
      const set = this.index.get(key) ?? new Set<string>()
      if (s.scopeId !== null) set.add(s.scopeId)
      this.index.set(key, set)
    }
  }

  can(permissionCode: string, scope?: ScopeRef): boolean {
    if (this.globals.has(permissionCode)) return true
    if (!scope) return false
    return this.index.get(`${permissionCode}:${scope.type}`)?.has(scope.id) ?? false
  }

  /** Усі id у межах конкретного типу скоупу — для побудови фільтрів у запитах. */
  scopeIds(permissionCode: string, scopeType: ScopeRef['type']): readonly string[] {
    return [...(this.index.get(`${permissionCode}:${scopeType}`) ?? [])]
  }
}

export function requirePermission(
  permissions: EffectivePermissions,
  permissionCode: string,
  scope?: ScopeRef,
): void {
  if (!permissions.can(permissionCode, scope)) {
    throw new ForbiddenError(permissionCode)
  }
}

export { ForbiddenError }
