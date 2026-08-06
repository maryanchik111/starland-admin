import type { EffectivePermissions } from '@starland/domain'
import { NAV_ITEMS, type NavItem } from './nav-config'

export function visibleNavItems(permissions: EffectivePermissions): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.permissionCode === null || permissions.can(item.permissionCode),
  )
}
