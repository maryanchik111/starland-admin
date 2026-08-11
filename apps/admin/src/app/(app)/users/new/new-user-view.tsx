'use client'

import { uk } from '@starland/i18n'
import { submitCreateUser } from '@/app/(app)/users/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewUserForm } from './new-user-form'
import type { NewUserData } from './new-user-content'

export function NewUserView({ data }: { data: NewUserData }) {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{uk.users.newUser}</CardTitle>
      </CardHeader>
      <CardContent>
        <NewUserForm roles={data.roles} submitAction={submitCreateUser} />
      </CardContent>
    </Card>
  )
}
