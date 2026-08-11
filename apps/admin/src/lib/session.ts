import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { prisma } from '@starland/db'
import { loadEffectivePermissions } from '@starland/domain/server'
import type { EffectivePermissions } from '@starland/domain'

export interface Session {
  /** Ідентифікатор у auth.users — саме він іде у withUserContext. */
  authUserId: string
  appUserId: string
  fullName: string
  permissions: EffectivePermissions
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
          list.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  if (!data.user) return null

  const appUser = await prisma.appUser.findFirst({
    where: { authUserId: data.user.id, deletedAt: null, isActive: true },
  })
  if (!appUser) return null

  return {
    authUserId: data.user.id,
    appUserId: appUser.id,
    fullName: appUser.fullName,
    permissions: await loadEffectivePermissions(appUser.id),
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new Error('unauthenticated')
  return session
}
