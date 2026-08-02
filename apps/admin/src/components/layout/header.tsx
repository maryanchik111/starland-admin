import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from './user-menu.js'

export function Header({ fullName }: { fullName: string }) {
  return (
    <header className="flex h-16 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu fullName={fullName} />
    </header>
  )
}
