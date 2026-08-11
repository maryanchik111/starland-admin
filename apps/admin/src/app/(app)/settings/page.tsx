import { Settings } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function SettingsPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.settings.title} description={uk.modules.settings.description} icon={Settings} />
}
