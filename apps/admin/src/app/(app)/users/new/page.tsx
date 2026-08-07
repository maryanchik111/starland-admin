import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { createUser } from '@/app/(app)/users/actions'
import { ConflictError, NotFoundError } from '@starland/domain'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewUserForm } from './new-user-form'

export default async function NewUserPage() {
  const session = await requireSession()
  // Direct-URL guard: the button that links here is already hidden without
  // `users.write`, but the page needs its own check too (CLAUDE.md §6).
  if (!session.permissions.can('users.write')) redirect('/users')

  const roles = await prisma.role.findMany({ orderBy: [{ name: 'asc' }], select: { code: true, name: true } })

  async function submitNewUser(
    raw: unknown,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    'use server'

    try {
      const { id } = await createUser(raw)
      return { ok: true, id }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.users.createError }
      }
      if (err instanceof ConflictError) {
        return { ok: false, message: uk.users.duplicateEmail }
      }
      if (err instanceof NotFoundError) {
        return { ok: false, message: uk.users.unknownRole }
      }
      return { ok: false, message: uk.users.createError }
    }
  }

  return (
    <main className="p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{uk.users.newUser}</CardTitle>
        </CardHeader>
        <CardContent>
          <NewUserForm roles={roles} submitAction={submitNewUser} />
        </CardContent>
      </Card>
    </main>
  )
}
