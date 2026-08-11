import { MessageSquare } from 'lucide-react'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { ModulePlaceholder } from '@/components/module-placeholder'

export default async function ChatPage() {
  await requireSession()
  return <ModulePlaceholder title={uk.modules.chat.title} description={uk.modules.chat.description} icon={MessageSquare} />
}
