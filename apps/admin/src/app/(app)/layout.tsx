import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar.js'
import { Header } from '@/components/layout/header.js'
import { CommandMenu } from '@/components/layout/command-menu.js'
import { NAV_ITEMS } from '@/components/layout/nav-config.js'
import { visibleNavItems } from '@/components/layout/visible-nav-items.js'
import { requireSession } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const items = visibleNavItems(session.permissions)

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      <SidebarInset>
        <Header fullName={session.fullName} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <CommandMenu items={items.length > 0 ? items : NAV_ITEMS} />
    </SidebarProvider>
  )
}
