'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { PersonLink } from '@/components/person-link'

/**
 * One rendered row of the users list. Computed server-side in `page.tsx`
 * (name/email/roles/status already resolved through the RLS-scoped query)
 * — this file only renders what it is given.
 */
export type UserRow = {
  id: string
  fullName: string
  email: string
  roles: string[]
  isActive: boolean
}

export const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: 'fullName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={uk.users.fullName} />
    ),
    cell: ({ row }) => <PersonLink id={row.original.id} name={row.original.fullName} kind="user" />,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={uk.users.email} />
    ),
    cell: ({ row }) => <span className='text-muted-foreground'>{row.original.email}</span>,
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
