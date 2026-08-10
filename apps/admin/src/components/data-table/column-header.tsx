'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { uk } from '@starland/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { nextSortHref, type SortDirection } from './query-string'

type DataTableColumnHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string
  /**
   * Query-param value this column sorts by (`?sort=<sortKey>`). Omit for
   * columns that have nothing to order the query by (e.g. derived/joined
   * columns like a list of role names).
   */
  sortKey?: string
}

/**
 * Sortable column header driven entirely by URL params (`sort`/`dir`) — the
 * server component reads them and applies `orderBy` across the whole result
 * set, not just the page already loaded. Clicking an option navigates, the
 * same way `DataTablePagination` links do; there is no client-side sort
 * state to keep in sync.
 */
export function DataTableColumnHeader({
  title,
  sortKey,
  className,
}: DataTableColumnHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (!sortKey) {
    return <div className={cn(className)}>{title}</div>
  }

  const params = Object.fromEntries(searchParams.entries())
  const activeDirection: SortDirection | undefined =
    searchParams.get('sort') === sortKey
      ? searchParams.get('dir') === 'desc'
        ? 'desc'
        : 'asc'
      : undefined

  function go(direction: SortDirection | undefined) {
    router.push(nextSortHref(pathname, params, sortKey!, direction))
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='h-8 data-[state=open]:bg-accent'
          >
            <span>{title}</span>
            {activeDirection === 'desc' ? (
              <ArrowDown className='ms-2 h-4 w-4' />
            ) : activeDirection === 'asc' ? (
              <ArrowUp className='ms-2 h-4 w-4' />
            ) : (
              <ChevronsUpDown className='ms-2 h-4 w-4' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem onClick={() => go('asc')}>
            <ArrowUp className='size-3.5 text-muted-foreground/70' />
            {uk.dataTable.sortAsc}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go('desc')}>
            <ArrowDown className='size-3.5 text-muted-foreground/70' />
            {uk.dataTable.sortDesc}
          </DropdownMenuItem>
          {activeDirection && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go(undefined)}>
                {uk.dataTable.reset}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
