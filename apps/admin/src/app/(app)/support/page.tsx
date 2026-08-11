import { HeartHandshake } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function SupportPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.support.title} description={uk.modules.support.description} icon={HeartHandshake} />
}
