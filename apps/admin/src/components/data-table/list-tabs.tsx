import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buildHref, type QueryParams } from './query-string'

export type ListTab = { key: string; label: string }

/**
 * URL-driven tab bar for a list page — same convention as
 * `DataTablePagination`: plain `<Link>`s carry the state (`?tab=...`), no
 * client component or Radix `Tabs` context. Switching tabs drops
 * `page`/`q`/`sort`/`dir` since each tab runs its own query against a
 * different model — carrying pagination/sort state across doesn't mean
 * anything.
 */
export function ListTabs({
  basePath,
  searchParams,
  tabs,
  activeTab,
}: {
  basePath: string
  searchParams?: QueryParams
  tabs: ListTab[]
  activeTab: string
}) {
  return (
    <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-0.75 text-muted-foreground">
      {tabs.map((tab) => {
        const active = tab.key === activeTab
        return (
          <Link
            key={tab.key}
            href={buildHref(basePath, searchParams, {
              tab: tab.key,
              page: undefined,
              q: undefined,
              sort: undefined,
              dir: undefined,
            })}
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]',
              active
                ? 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
                : 'hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
