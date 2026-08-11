'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Command } from 'lucide-react'
import { uk } from '@starland/i18n'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NAV_ITEMS, type SerializableNavItem } from './nav-config'

export function AppSidebar({ items }: { items: SerializableNavItem[] }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Command className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-semibold tracking-tight">Starland Admin</span>
            <span className="text-xs text-muted-foreground">Система управління</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{uk.common.navSections}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = NAV_ITEMS.find((n) => n.url === item.url)?.icon
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                    <Link href={item.url}>
                      {Icon && <Icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

