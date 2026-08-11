import { CalendarClock } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function SchedulePage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.schedule.title} description={uk.modules.schedule.description} icon={CalendarClock} />
}
