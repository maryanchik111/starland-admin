'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function signOut(): Promise<void> {
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
  await supabase.auth.signOut()
  redirect('/login')
}
