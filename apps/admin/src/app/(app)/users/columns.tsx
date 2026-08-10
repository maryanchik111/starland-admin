'use client'

import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DataTableColumnHeader } from '@/components/data-table/column-header'

export type UserRow = {
  id: string
  fullName: string
  email: string
  roles: string[]
  isActive: boolean
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export const columns: ColumnDef<UserRow>[] = [
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
  {
    id: 'status',
    header: uk.users.status,
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'outline'}>
        {row.original.isActive ? uk.users.active : uk.users.inactive}
      </Badge>
    ),
  },
]
