import type { EffectivePermissions } from '@starland/domain'
import { NAV_ITEMS, type NavItem } from './nav-config'

export function visibleNavItems(permissions: EffectivePermissions): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.permissionCode === null) return true
    if (Array.isArray(item.permissionCode)) return item.permissionCode.some((code) => permissions.can(code))
    return permissions.can(item.permissionCode)
  })
}
