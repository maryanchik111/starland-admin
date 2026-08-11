import { FileWarning } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function RemarksPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.remarks.title} description={uk.modules.remarks.description} icon={FileWarning} />
}
