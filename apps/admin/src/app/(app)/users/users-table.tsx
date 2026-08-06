'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { uk } from '@starland/i18n'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableToolbar } from '@/components/data-table/toolbar'
import { DataTablePagination } from '@/components/data-table/pagination'
import { columns, type UserRow } from './columns'

type UsersTableProps = {
  data: UserRow[]
  page: number
  pageSize: number
  totalCount: number
  searchParams: Record<string, string | string[] | undefined>
}

/**
 * Thin client-side rendering shell, same pattern as `students-table.tsx`:
 * `data` is already the fetched page (server-side `skip`/`take` + RLS
 * happened in `page.tsx`), `@tanstack/react-table` here only renders
 * columns and sorts the already-loaded rows in memory.
 */
export function UsersTable({
  data,
  page,
  pageSize,
  totalCount,
  searchParams,
}: UsersTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar searchPlaceholder={uk.common.search} />
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  {uk.common.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        basePath='/users'
        searchParams={searchParams}
      />
    </div>
  )
}
