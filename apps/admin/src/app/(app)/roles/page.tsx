import { ShieldCheck } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function RolesPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.roles.title} description={uk.modules.roles.description} icon={ShieldCheck} />
}
