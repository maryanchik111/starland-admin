'use client'

import { Search, Bell } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { UserMenu } from './user-menu'

export function Header({ fullName }: { fullName: string }) {
  const triggerCommandMenu = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <span className="text-sm font-medium">Starland</span>
      </div>

      <div className="flex-1 flex justify-center lg:justify-end">
        <Button
          variant="outline"
          className="relative h-9 w-full justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-64 lg:w-80"
          onClick={triggerCommandMenu}
        >
          <Search className="mr-2 size-4" />
          <span className="hidden lg:inline-flex">{uk.common.commandPlaceholder || 'Шукати...'}</span>
          <span className="inline-flex lg:hidden">Шукати...</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-9 rounded-full">
          <Bell className="size-4" />
          <span className="sr-only">Сповіщення</span>
        </Button>
        <UserMenu fullName={fullName} />
      </div>
    </header>
  )
}
