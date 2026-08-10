export type QueryParams = Record<string, string | string[] | undefined>

/**
 * Merges `searchParams` (as read from a server component's `searchParams`
 * prop, or `useSearchParams()`) with `overrides`, dropping any key whose
 * override is `undefined`. Shared by pagination links and column-sort links
 * so both agree on how query state round-trips through the URL.
 */
export function buildHref(
  basePath: string,
  searchParams: QueryParams | undefined,
  overrides: Record<string, string | number | undefined>,
): string {
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
    if (value === undefined) {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }
  }
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

export type SortDirection = 'asc' | 'desc'

/**
 * Href for the next state of a sortable column: `direction` set applies
 * `sort=<sortKey>&dir=<direction>`; `undefined` clears both. Always resets
 * `page` — a re-sorted list starts back at page 1.
 */
export function nextSortHref(
  basePath: string,
  searchParams: QueryParams | undefined,
  sortKey: string,
  direction: SortDirection | undefined,
): string {
  return buildHref(basePath, searchParams, {
    sort: direction ? sortKey : undefined,
    dir: direction,
    page: undefined,
  })
}
