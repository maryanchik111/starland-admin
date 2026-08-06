'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uk } from '@starland/i18n'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { searchPeople } from '@/app/(app)/command-menu-actions'
import { NAV_ITEMS, type SerializableNavItem } from './nav-config'
import type { PersonResult } from '@/lib/search-people'

export function CommandMenu({ items }: { items: readonly SerializableNavItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<PersonResult[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      return
    }
    let cancelled = false
    startTransition(async () => {
      const results = await searchPeople(query)
      if (!cancelled) {
        setPeople(results)
      }
    })
    return () => {
      cancelled = true
    }
  }, [query])

  const visiblePeople = query.trim().length < 2 ? [] : people

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={uk.common.commandPaletteTitle}
      description={uk.common.commandPaletteDescription}
    >
      <CommandInput
        placeholder={uk.common.commandPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{isPending ? uk.common.searching : uk.common.empty}</CommandEmpty>
        <CommandGroup heading={uk.common.navSections}>
          {items.map((item) => {
            const Icon = NAV_ITEMS.find((n) => n.url === item.url)?.icon
            return (
              <CommandItem
                key={item.url}
                value={item.title}
                onSelect={() => {
                  setOpen(false)
                  router.push(item.url)
                }}
              >
                {Icon && <Icon />}
                <span>{item.title}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        {visiblePeople.length > 0 && (
          <CommandGroup heading={uk.students.title}>
            {visiblePeople.map((person) => (
              <CommandItem
                key={person.id}
                value={person.name}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/students/${person.id}`)
                }}
              >
                <span>{person.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
