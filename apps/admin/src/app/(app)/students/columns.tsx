'use client'

import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal } from 'lucide-react'
import { uk } from '@starland/i18n'
import { PersonLink } from '@/components/person-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * One rendered row of the students list. Computed server-side in
 * `page.tsx` (name/class already resolved through the RLS-scoped query,
 * `canEdit` already resolved through `session.permissions.can(...)`) —
 * this file only renders what it is given, it never re-derives access.
 */
export type StudentRow = {
  id: string
  fullName: string
  className: string | null
  canEdit: boolean
}

export const columns: ColumnDef<StudentRow>[] = [
  {
    accessorKey: 'fullName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={uk.students.fullName} />
    ),
    cell: ({ row }) => (
      <PersonLink id={row.original.id} kind='student' name={row.original.fullName} />
    ),
  },
  {
    accessorKey: 'className',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={uk.students.class} />
    ),
    cell: ({ row }) =>
      row.original.className ? (
        <Badge variant='secondary'>{row.original.className}</Badge>
      ) : (
        <span className='text-muted-foreground'>{uk.students.noClass}</span>
      ),
  },
  {
    id: 'actions',
    header: uk.students.actions,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='h-8 w-8 p-0'>
            <span className='sr-only'>{uk.students.openMenu}</span>
            <MoreHorizontal className='h-4 w-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem asChild>
            <Link href={`/students/${row.original.id}`}>{uk.students.view}</Link>
          </DropdownMenuItem>
          {row.original.canEdit && (
            <DropdownMenuItem asChild>
              <Link href={`/students/${row.original.id}/edit`}>{uk.common.edit}</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
