import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const session = await requireSession()

  return (
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {uk.dashboard.welcomeTitle}, {session.fullName}
          </CardTitle>
          <CardDescription>{uk.dashboard.welcomeDescription}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}
