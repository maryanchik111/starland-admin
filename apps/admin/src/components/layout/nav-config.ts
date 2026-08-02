import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Users } from 'lucide-react'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** null — пункт видно всім автентифікованим користувачам (напр. дашборд). */
  permissionCode: string | null
}

export const NAV_ITEMS: readonly NavItem[] = [
  { title: 'Дашборд', url: '/', icon: LayoutDashboard, permissionCode: null },
  { title: 'Учні', url: '/students', icon: Users, permissionCode: 'students.read' },
] as const
