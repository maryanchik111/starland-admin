import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Users } from 'lucide-react'
import { uk } from '@starland/i18n'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** null — пункт видно всім автентифікованим користувачам (напр. дашборд). */
  permissionCode: string | null
}

/** Плоска, серіалізовна проєкція NavItem — безпечна для передачі через межу Server/Client Component. */
export interface SerializableNavItem {
  title: string
  url: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { title: uk.common.dashboard, url: '/', icon: LayoutDashboard, permissionCode: null },
  { title: uk.students.title, url: '/students', icon: Users, permissionCode: 'students.read' },
] as const
