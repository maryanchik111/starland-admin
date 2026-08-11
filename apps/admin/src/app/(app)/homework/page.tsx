import { NotebookPen } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function HomeworkPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.homework.title} description={uk.modules.homework.description} icon={NotebookPen} />
}
