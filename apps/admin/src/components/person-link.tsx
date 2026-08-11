'use client'

import { usePersonModal } from '@/components/person-modal-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type Kind = 'student' | 'staff' | 'user'

export function PersonLink({
  id, name, kind, photoUrl,
}: {
  id: string
  name: string
  kind: Kind
  /** Підписаний URL із коротким TTL. Відсутній — рендеримо ініціали. */
  photoUrl?: string | undefined
}) {
  const { openStudent, openStaff, openUser } = usePersonModal()
  const initials = name.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('')

  function handleClick() {
    if (kind === 'student') openStudent(id)
    else if (kind === 'staff') openStaff(id)
    else openUser(id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 hover:text-primary cursor-pointer text-left"
    >
      <Avatar className="size-6">
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      {name}
    </button>
  )
}
