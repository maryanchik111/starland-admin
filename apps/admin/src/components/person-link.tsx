import Link from 'next/link'

const PATH_BY_KIND: Record<'student' | 'staff' | 'user', string> = {
  student: 'students',
  staff: 'staff',
  user: 'users',
}

export function PersonLink({
  id, name, kind, photoUrl,
}: {
  id: string
  name: string
  kind: 'student' | 'staff' | 'user'
  /** Підписаний URL із коротким TTL. Відсутній — рендеримо ініціали. */
  photoUrl?: string | undefined
}) {
  const initials = name.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('')

  return (
    <Link className="inline-flex items-center gap-2 underline underline-offset-2"
          href={`/${PATH_BY_KIND[kind]}/${id}`}>
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-neutral-200 text-xs">
          {initials}
        </span>
      )}
      {name}
    </Link>
  )
}
