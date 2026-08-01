'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { uk } from '@starland/i18n'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(uk.auth.invalidCredentials)
      return
    }
    window.location.href = '/'
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">Starland</h1>
      <input className="rounded border px-3 py-2" type="email" placeholder={uk.auth.email}
             value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border px-3 py-2" type="password" placeholder={uk.auth.password}
             value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-black px-3 py-2 text-white" type="submit">{uk.auth.signIn}</button>
    </form>
  )
}
