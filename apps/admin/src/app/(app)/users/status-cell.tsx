'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { setUserActiveFromList } from './list-actions'

/**
 * Row-level status badge + activate/deactivate, self-contained rather than
 * reusing `[id]/status-toggle.tsx` — that file is mid-refactor in a parallel
 * session, so this list surface stays decoupled from it for now.
 */
export function StatusCell({ userId, isActive, canManage }: { userId: string; isActive: boolean; canManage: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSetActive(next: boolean) {
    startTransition(async () => {
      const result = await setUserActiveFromList(userId, next)
      if (result.ok) {
        toast.success(next ? uk.users.reactivateSuccess : uk.users.deactivateSuccess)
        router.refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isActive ? 'default' : 'outline'}>{isActive ? uk.users.active : uk.users.inactive}</Badge>
      {canManage &&
        (isActive ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                {uk.users.deactivate}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{uk.users.deactivateConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{uk.users.deactivateConfirmDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleSetActive(false)}>{uk.users.deactivate}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleSetActive(true)}>
            {uk.users.reactivate}
          </Button>
        ))}
    </div>
  )
}
