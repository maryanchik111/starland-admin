'use client'

import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Eye, Pencil } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { calculateAge, formatDate } from '@/lib/date'

export type StudentRow = {
  id: string
  fullName: string
  className: string | null
  bornOn: string
  criticalNote: string | null
  guardian: { fullName: string; phone: string | null } | null
  isEnrolled: boolean
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
          {student.criticalNote && (
            <span title={student.criticalNote} className="shrink-0">
              <AlertTriangle className="size-4 text-destructive" aria-label={uk.students.criticalNote} />
            </span>
          )}
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
    id: 'status',
    header: uk.students.enrollmentStatus,
    cell: ({ row }) => (
      <Badge variant={row.original.isEnrolled ? 'default' : 'outline'}>
        {row.original.isEnrolled ? uk.students.enrollmentActive : uk.students.enrollmentInactive}
      </Badge>
    ),
  },
  {
    accessorKey: 'bornOn',
    header: () => <DataTableColumnHeader title={uk.students.bornOn} sortKey="bornOn" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.bornOn)} ({calculateAge(row.original.bornOn)} {uk.students.ageYears})
      </span>
    ),
  },
  {
    id: 'guardian',
    header: uk.students.guardian,
    cell: ({ row }) => {
      const guardian = row.original.guardian
      if (!guardian) return <span className='text-muted-foreground'>{uk.students.noGuardian}</span>
      return (
        <div className="flex flex-col">
          <span className="text-sm">{guardian.fullName}</span>
          {guardian.phone && <span className="text-xs text-muted-foreground">{guardian.phone}</span>}
        </div>
      )
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">{uk.students.actions}</div>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-0.5 text-muted-foreground">
        <Button variant="ghost" size="icon" asChild className="size-8 hover:text-foreground" title={uk.students.view}>
          <Link href={`/students/${row.original.id}`}>
            <Eye className="size-4" />
          </Link>
        </Button>
        {row.original.canEdit && (
          <Button variant="ghost" size="icon" asChild className="size-8 hover:text-foreground" title={uk.common.edit}>
            <Link href={`/students/${row.original.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        )}
      </div>
    ),
  },
]
