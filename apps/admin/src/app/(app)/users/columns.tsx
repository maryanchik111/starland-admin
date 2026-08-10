'use client'

import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { formatDate } from '@/lib/date'
import { StatusCell } from './status-cell'

export type UserRow = {
  id: string
  fullName: string
  email: string
  roles: string[]
  isActive: boolean
  phone: string | null
  position: string | null
  createdAt: string
  canManage: boolean
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

/**
 * Phone/position come from `staff_profiles`, gated by `staff.read` — a
 * viewer without that permission never receives the data (see
 * `users/page.tsx`), so the columns are omitted entirely rather than
 * rendered empty.
 */
export function buildColumns({ showStaffContact }: { showStaffContact: boolean }): ColumnDef<UserRow>[] {
  return [
    {
      accessorKey: 'fullName',
      header: () => <DataTableColumnHeader title={uk.users.fullName} sortKey="fullName" />,
      cell: ({ row }) => {
        const user = row.original
        return (
          <Link href={`/users/${user.id}`} className="flex items-center gap-3 hover:text-primary">
            <Avatar className="h-9 w-9 rounded-md bg-indigo-100 text-indigo-700">
              <AvatarFallback className="rounded-md bg-indigo-100 text-indigo-700 font-medium">
                {getInitials(user.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground text-sm">{user.fullName}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{user.email}</span>
            </div>
          </Link>
        )
      },
    },
    {
      id: 'roles',
      header: uk.users.roles,
      cell: ({ row }) =>
        row.original.roles.length ? (
          <div className='flex flex-wrap gap-1'>
            {row.original.roles.map((role) => (
              <Badge key={role} variant='secondary'>
                {role}
              </Badge>
            ))}
          </div>
        ) : (
          <span className='text-muted-foreground'>{uk.users.noRoles}</span>
        ),
    },
    ...(showStaffContact
      ? ([
          {
            id: 'phone',
            header: uk.users.phone,
            cell: ({ row }) => row.original.phone ?? <span className='text-muted-foreground'>—</span>,
          },
          {
            id: 'position',
            header: uk.users.position,
            cell: ({ row }) => row.original.position ?? <span className='text-muted-foreground'>—</span>,
          },
        ] satisfies ColumnDef<UserRow>[])
      : []),
    {
      accessorKey: 'createdAt',
      header: () => <DataTableColumnHeader title={uk.users.createdAt} sortKey="createdAt" />,
      cell: ({ row }) => <span className='text-muted-foreground'>{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'status',
      header: () => <DataTableColumnHeader title={uk.users.status} sortKey="status" />,
      cell: ({ row }) => (
        <StatusCell userId={row.original.id} isActive={row.original.isActive} canManage={row.original.canManage} />
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{uk.users.actions}</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end text-muted-foreground">
          <Button variant="ghost" size="icon" asChild className="size-8 hover:text-foreground" title={uk.users.view}>
            <Link href={`/users/${row.original.id}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
        </div>
      ),
    },
  ]
}
