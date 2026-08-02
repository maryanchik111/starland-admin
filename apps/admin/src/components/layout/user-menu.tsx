'use client'

import { LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/app/(app)/sign-out/actions.js'

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0]?.[0] ?? '' ) + (parts[parts.length - 1]?.[0] ?? '')
}

export function UserMenu({ fullName }: { fullName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Меню користувача" className="rounded-full">
          <Avatar>
            <AvatarFallback>{initials(fullName).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          <span>Вийти</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
