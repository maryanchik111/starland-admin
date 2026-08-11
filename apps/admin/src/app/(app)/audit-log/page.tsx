import { History } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function AuditLogPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.auditLog.title} description={uk.modules.auditLog.description} icon={History} />
}
