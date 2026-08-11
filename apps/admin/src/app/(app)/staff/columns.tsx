'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
import { PersonLink } from '@/components/person-link'
import { DataTableColumnHeader } from '@/components/data-table/column-header'
import { formatDate } from '@/lib/date'

export type StaffRow = {
  id: string
  userId: string | null
  fullName: string
  positionName: string | null
  employmentStatus: 'working' | 'vacation' | 'sick_leave' | 'maternity_leave' | 'unpaid_leave' | 'dismissed'
  phone: string | null
  hiredOn: string | null
}

export const columns: ColumnDef<StaffRow>[] = [
  {
    accessorKey: 'fullName',
    header: () => <DataTableColumnHeader title={uk.staff.fullName} sortKey="fullName" />,
    cell: ({ row }) => {
      const person = row.original
      // A record without `userId` has no system login — its profile lives
      // at `/staff/[id]` (own identity, no account tabs), not `/users/[id]`
      // (see docs/plans/2026-08-10-unified-profile-modals.md, Task 7).
      if (!person.userId) {
        return <PersonLink id={person.id} name={person.fullName} kind="staff" />
      }
      return <PersonLink id={person.userId} name={person.fullName} kind="user" />
    },
  },
  {
    id: 'position',
    header: uk.staff.position,
    cell: ({ row }) => row.original.positionName ?? <span className="text-muted-foreground">{uk.staff.noPosition}</span>,
  },
  {
    id: 'employmentStatus',
    header: uk.staff.employmentStatus,
    cell: ({ row }) => (
      <Badge variant={row.original.employmentStatus === 'working' ? 'default' : 'outline'}>
        {uk.users.employmentStatuses[row.original.employmentStatus]}
      </Badge>
    ),
  },
  {
    id: 'phone',
    header: uk.staff.phone,
    cell: ({ row }) => row.original.phone ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'hasAccount',
    header: uk.staff.hasAccount,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.userId ? uk.staff.hasAccount : uk.staff.noAccount}
      </span>
    ),
  },
  {
    accessorKey: 'hiredOn',
    header: () => <DataTableColumnHeader title={uk.staff.hiredOn} sortKey="hiredOn" />,
    cell: ({ row }) =>
      row.original.hiredOn ? (
        <span className="text-muted-foreground">{formatDate(row.original.hiredOn)}</span>
      ) : (
        <span className="text-muted-foreground">{uk.staff.noHiredOn}</span>
      ),
  },
]
