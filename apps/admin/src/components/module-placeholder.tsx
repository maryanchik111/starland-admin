import type { LucideIcon } from 'lucide-react'
import { uk } from '@starland/i18n'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'

export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Icon className="size-10 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">{uk.common.moduleInDevelopment}</p>
        </CardContent>
      </Card>
    </div>
  )
}
