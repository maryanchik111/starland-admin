'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { XIcon } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type DataTableToolbarProps = {
  /** Query-string key the search term is read from / written to. */
  searchParamKey?: string
  searchPlaceholder?: string
  /** Debounce before pushing the new search term into the URL. */
  debounceMs?: number
}

/**
 * Server-driven search box for a Next.js App Router data table page.
 *
 * Unlike the reference implementation (React Router + client-side table
 * filtering), search state here lives in the URL: typing debounces into a
 * `router.push` with an updated query string, which the server component
 * reads from `searchParams` to re-query the page. Changing the search term
 * also clears `page` so a stale page number is never carried across a new
 * filter.
 */
export function DataTableToolbar({
  searchParamKey = 'q',
  searchPlaceholder = uk.dataTable.searchPlaceholder,
  debounceMs = 300,
}: DataTableToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlValue = searchParams.get(searchParamKey) ?? ''
  const [value, setValue] = React.useState(urlValue)
  // Resync local state when the URL changes from outside this component
  // (back/forward navigation, a different filter control, etc.) without
  // calling setState unconditionally on every render.
  const [syncedUrlValue, setSyncedUrlValue] = React.useState(urlValue)
  if (urlValue !== syncedUrlValue && value === syncedUrlValue) {
    setSyncedUrlValue(urlValue)
    setValue(urlValue)
  } else if (urlValue !== syncedUrlValue) {
    setSyncedUrlValue(urlValue)
  }

  React.useEffect(() => {
    const currentValue = searchParams.get(searchParamKey) ?? ''
    if (value === currentValue) {
      return
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(searchParamKey, value)
      } else {
        params.delete(searchParamKey)
      }
      params.delete('page')

      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
    }, debounceMs)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, pathname, searchParamKey])

  const isFiltered = Boolean(searchParams.get(searchParamKey))

  return (
    <div className='flex items-center justify-between'>
      <div className='flex flex-1 items-center gap-x-2'>
        <Input
          placeholder={searchPlaceholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className='h-8 w-37.5 lg:w-62.5'
        />
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={() => setValue('')}
            className='h-8 px-2 lg:px-3'
          >
            {uk.dataTable.reset}
            <XIcon className='ms-2 h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  )
}
