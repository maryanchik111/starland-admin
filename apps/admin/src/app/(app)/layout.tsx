import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar.js'
import { Header } from '@/components/layout/header.js'
import { CommandMenu } from '@/components/layout/command-menu.js'
import { visibleNavItems } from '@/components/layout/visible-nav-items.js'
import { requireSession } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const items = visibleNavItems(session.permissions)
  const serializableItems = items.map(({ title, url }) => ({ title, url }))

  return (
    <SidebarProvider>
      <AppSidebar items={serializableItems} />
      <SidebarInset>
        <Header fullName={session.fullName} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <CommandMenu items={serializableItems} />
    </SidebarProvider>
  )
}
