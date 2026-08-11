import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  UserCog,
  School,
  CalendarClock,
  GraduationCap,
  NotebookPen,
  ClipboardCheck,
  MessageSquare,
  HeartHandshake,
  FileWarning,
  BarChart3,
  ShieldCheck,
  History,
  CalendarDays,
  Settings,
} from 'lucide-react'
import { uk } from '@starland/i18n'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /**
   * null — пункт видно всім автентифікованим користувачам (напр. дашборд).
   * Масив — видно, якщо є хоча б один із дозволів (any-of): `/users` веде на
   * сторінку з вкладками, кожна за своїм дозволом, тож сам пункт меню
   * видимий, поки доступна хоч одна вкладка.
   */
  permissionCode: string | string[] | null
}

/** Плоска, серіалізовна проєкція NavItem — безпечна для передачі через межу Server/Client Component. */
export interface SerializableNavItem {
  title: string
  url: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { title: uk.common.dashboard, url: '/', icon: LayoutDashboard, permissionCode: null },
  { title: uk.users.title, url: '/users', icon: UserCog, permissionCode: ['users.read', 'students.read', 'staff.read'] },
  { title: uk.modules.classes.title, url: '/classes', icon: School, permissionCode: null },
  { title: uk.modules.schedule.title, url: '/schedule', icon: CalendarClock, permissionCode: null },
  { title: uk.modules.grades.title, url: '/grades', icon: GraduationCap, permissionCode: null },
  { title: uk.modules.homework.title, url: '/homework', icon: NotebookPen, permissionCode: null },
  { title: uk.modules.attendance.title, url: '/attendance', icon: ClipboardCheck, permissionCode: null },
  { title: uk.modules.chat.title, url: '/chat', icon: MessageSquare, permissionCode: null },
  { title: uk.modules.support.title, url: '/support', icon: HeartHandshake, permissionCode: null },
  { title: uk.modules.remarks.title, url: '/remarks', icon: FileWarning, permissionCode: null },
  { title: uk.modules.reports.title, url: '/reports', icon: BarChart3, permissionCode: null },
  { title: uk.modules.roles.title, url: '/roles', icon: ShieldCheck, permissionCode: null },
  { title: uk.modules.auditLog.title, url: '/audit-log', icon: History, permissionCode: null },
  { title: uk.modules.calendar.title, url: '/calendar', icon: CalendarDays, permissionCode: null },
  { title: uk.modules.settings.title, url: '/settings', icon: Settings, permissionCode: null },
] as const
