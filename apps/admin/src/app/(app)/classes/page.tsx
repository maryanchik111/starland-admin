import { School } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function ClassesPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.classes.title} description={uk.modules.classes.description} icon={School} />
}
