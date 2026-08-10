'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type ActionResult = { ok: true } | { ok: false; message: string }

export function ClassAssign({
  currentClassName,
  availableClasses,
  assignAction,
}: {
  currentClassName: string | null
  availableClasses: { id: string; name: string }[]
  assignAction: (classId: string) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedClassId, setSelectedClassId] = useState('')
  const [open, setOpen] = useState(false)

  const selected = availableClasses.find((c) => c.id === selectedClassId)

  function handleConfirm() {
    if (!selectedClassId) return
    startTransition(async () => {
      const result = await assignAction(selectedClassId)
      if (result.ok) {
        toast.success(uk.students.assignClassSuccess)
        setSelectedClassId('')
        setOpen(false)
        router.refresh()
        return
      }
      toast.error(result.message)
    })
  }

  if (availableClasses.length === 0) {
    return <span>{currentClassName ?? '—'}</span>
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{currentClassName ?? '—'}</span>
      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder={uk.students.selectClass} />
        </SelectTrigger>
        <SelectContent>
          {availableClasses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={!selectedClassId || isPending}>
            {uk.students.assignClass}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uk.students.assignClassConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {uk.students.assignClassConfirmDescription} {selected?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>{uk.students.assignClass}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  )
}
