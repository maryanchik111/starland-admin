import { BarChart3 } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function ReportsPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.reports.title} description={uk.modules.reports.description} icon={BarChart3} />
}
