'use client'

import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye, Pencil } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table/column-header'

export type StudentRow = {
  id: string
  fullName: string
  className: string | null
  canEdit: boolean
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export const columns: ColumnDef<StudentRow>[] = [
  {
    accessorKey: 'fullName',
    header: () => <DataTableColumnHeader title={uk.students.fullName} sortKey="fullName" />,
    cell: ({ row }) => {
      const student = row.original
      return (
        <Link href={`/students/${student.id}`} className="flex items-center gap-3 hover:text-primary">
          <Avatar className="h-9 w-9 rounded-md bg-orange-100 text-orange-700">
            <AvatarFallback className="rounded-md bg-orange-100 text-orange-700 font-medium">
              {getInitials(student.fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-foreground text-sm">{student.fullName}</span>
        </Link>
      )
    },
  },
  {
    accessorKey: 'className',
    header: () => <DataTableColumnHeader title={uk.students.class} />,
    cell: ({ row }) =>
      row.original.className ? (
        <Badge variant='secondary'>{row.original.className}</Badge>
      ) : (
        <span className='text-muted-foreground'>{uk.students.noClass}</span>
      ),
  },
  {
    id: 'actions',
    header: () => <div className="text-right">{uk.students.actions}</div>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="size-8 hover:text-foreground" title={uk.students.view ?? 'Переглянути'}>
          <Link href={`/students/${row.original.id}`}>
            <Eye className="size-4" />
          </Link>
        </Button>
        {row.original.canEdit && (
          <Button variant="ghost" size="icon" asChild className="size-8 hover:text-foreground" title={uk.common.edit ?? 'Редагувати'}>
            <Link href={`/students/${row.original.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    ),
  },
]
