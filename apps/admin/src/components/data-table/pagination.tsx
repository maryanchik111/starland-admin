import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { uk } from '@starland/i18n'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50]

type DataTablePaginationProps = {
  /** 1-based current page. */
  page: number
  pageSize: number
  totalCount: number
  /** Path the pagination links point at, e.g. from `usePathname()`. */
  basePath: string
  /** Current search params, used to preserve filters/sort across page links. */
  searchParams?: Record<string, string | string[] | undefined>
  pageSizeOptions?: number[]
  className?: string
}

function buildHref(
  basePath: string,
  searchParams: Record<string, string | string[] | undefined> | undefined,
  overrides: Record<string, string | number>
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else {
      params.set(key, value)
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/**
 * Page-number navigation for a server-paginated data table.
 *
 * Unlike the reference implementation (`table.setPageIndex` / React Router
 * `navigate`), page and page-size changes here are plain links: the server
 * component reads `page`/`pageSize` from `searchParams`, runs `skip`/`take`
 * + `count()`, and re-renders. No client JS is required for pagination
 * itself.
 */
export function DataTablePagination({
  page,
  pageSize,
  totalCount,
  basePath,
  searchParams,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const hasPrevious = currentPage > 1
  const hasNext = currentPage < totalPages

  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div
      className={cn(
        'flex items-center justify-between overflow-clip px-2',
        '@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4',
        className
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div className='flex w-full items-center justify-between'>
        <div className='flex w-25 items-center justify-center text-sm font-medium @2xl/content:hidden'>
          {uk.dataTable.page} {currentPage} {uk.dataTable.of} {totalPages}
        </div>
        <div className='flex items-center gap-2 @max-2xl/content:flex-row-reverse'>
          <div className='flex items-center gap-1'>
            {pageSizeOptions.map((size) => (
              <Link
                key={size}
                href={buildHref(basePath, searchParams, {
                  page: 1,
                  pageSize: size,
                })}
                className={cn(
                  buttonVariants({
                    variant: size === pageSize ? 'default' : 'outline',
                    size: 'sm',
                  }),
                  'h-8 min-w-8 px-2'
                )}
              >
                {size}
              </Link>
            ))}
          </div>
          <p className='hidden text-sm font-medium sm:block'>
            {uk.dataTable.rowsPerPage}
          </p>
        </div>
      </div>

      <div className='flex items-center sm:space-x-6 lg:space-x-8'>
        <div className='flex w-25 items-center justify-center text-sm font-medium @max-3xl/content:hidden'>
          {uk.dataTable.page} {currentPage} {uk.dataTable.of} {totalPages}
        </div>
        <div className='flex items-center space-x-2'>
          <PageLink
            basePath={basePath}
            searchParams={searchParams}
            page={1}
            pageSize={pageSize}
            disabled={!hasPrevious}
            label={uk.dataTable.goToFirstPage}
            className='@max-md/content:hidden'
          >
            <ChevronsLeft className='h-4 w-4' />
          </PageLink>
          <PageLink
            basePath={basePath}
            searchParams={searchParams}
            page={currentPage - 1}
            pageSize={pageSize}
            disabled={!hasPrevious}
            label={uk.dataTable.goToPreviousPage}
          >
            <ChevronLeft className='h-4 w-4' />
          </PageLink>

          {pageNumbers.map((pageNumber, index) => (
            <div key={`${pageNumber}-${index}`} className='flex items-center'>
              {pageNumber === '...' ? (
                <span className='px-1 text-sm text-muted-foreground'>...</span>
              ) : (
                <Link
                  href={buildHref(basePath, searchParams, {
                    page: pageNumber,
                    pageSize,
                  })}
                  className={cn(
                    buttonVariants({
                      variant: currentPage === pageNumber ? 'default' : 'outline',
                    }),
                    'h-8 min-w-8 px-2'
                  )}
                >
                  <span className='sr-only'>
                    {uk.dataTable.page} {pageNumber}
                  </span>
                  {pageNumber}
                </Link>
              )}
            </div>
          ))}

          <PageLink
            basePath={basePath}
            searchParams={searchParams}
            page={currentPage + 1}
            pageSize={pageSize}
            disabled={!hasNext}
            label={uk.dataTable.goToNextPage}
          >
            <ChevronRight className='h-4 w-4' />
          </PageLink>
          <PageLink
            basePath={basePath}
            searchParams={searchParams}
            page={totalPages}
            pageSize={pageSize}
            disabled={!hasNext}
            label={uk.dataTable.goToLastPage}
            className='@max-md/content:hidden'
          >
            <ChevronsRight className='h-4 w-4' />
          </PageLink>
        </div>
      </div>
    </div>
  )
}

type PageLinkProps = {
  basePath: string
  searchParams?: Record<string, string | string[] | undefined>
  page: number
  pageSize: number
  disabled: boolean
  label: string
  className?: string
  children: React.ReactNode
}

function PageLink({
  basePath,
  searchParams,
  page,
  pageSize,
  disabled,
  label,
  className,
  children,
}: PageLinkProps) {
  const classes = cn(
    buttonVariants({ variant: 'outline' }),
    'size-8 p-0',
    disabled && 'pointer-events-none opacity-50',
    className
  )

  if (disabled) {
    return (
      <span className={classes} aria-disabled='true'>
        <span className='sr-only'>{label}</span>
        {children}
      </span>
    )
  }

  return (
    <Link href={buildHref(basePath, searchParams, { page, pageSize })} className={classes}>
      <span className='sr-only'>{label}</span>
      {children}
    </Link>
  )
}

/**
 * Page numbers with ellipsis, ported from reference-admin's
 * `getPageNumbers` (not reused directly since it lives in a `lib/utils.ts`
 * we keep untouched here).
 */
function getPageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5
  const rangeWithDots: (number | string)[] = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push(i)
    }
  } else {
    rangeWithDots.push(1)

    if (currentPage <= 3) {
      for (let i = 2; i <= 4; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    } else if (currentPage >= totalPages - 2) {
      rangeWithDots.push('...')
      for (let i = totalPages - 3; i <= totalPages; i++) {
        rangeWithDots.push(i)
      }
    } else {
      rangeWithDots.push('...')
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push('...', totalPages)
    }
  }

  return rangeWithDots
}
