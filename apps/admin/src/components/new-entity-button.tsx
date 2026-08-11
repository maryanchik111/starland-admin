'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePersonModal } from '@/components/person-modal-provider'

export function NewEntityButton({ kind, label }: { kind: 'user' | 'student' | 'staff'; label: string }) {
  const { openNewUser, openNewStudent, openNewStaff } = usePersonModal()

  function handleClick() {
    if (kind === 'user') openNewUser()
    else if (kind === 'student') openNewStudent()
    else openNewStaff()
  }

  return (
    <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleClick}>
      <Plus className="size-4" /> {label}
    </Button>
  )
}
