import { GraduationCap } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function GradesPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.grades.title} description={uk.modules.grades.description} icon={GraduationCap} />
}
