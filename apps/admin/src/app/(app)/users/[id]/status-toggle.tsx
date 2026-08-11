'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
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
import { cn } from '@/lib/utils'

type ActionResult = { ok: true } | { ok: false; message: string }

export function StatusToggle({
  isActive,
  canManage,
  setActiveAction,
  showBadge = true,
  buttonClassName,
}: {
  isActive: boolean
  canManage: boolean
  setActiveAction: (isActive: boolean) => Promise<ActionResult>
  showBadge?: boolean
  buttonClassName?: string
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()

  function handleSetActive(next: boolean) {
    startTransition(async () => {
      const result = await setActiveAction(next)
      if (result.ok) {
        toast.success(next ? uk.users.reactivateSuccess : uk.users.deactivateSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <span className="flex items-center gap-2">
      {showBadge && (
        <Badge variant={isActive ? 'default' : 'outline'}>
          {isActive ? uk.users.active : uk.users.inactive}
        </Badge>
      )}
      {canManage &&
        (isActive ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending} className={cn(buttonClassName)}>
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
                <AlertDialogAction onClick={() => handleSetActive(false)}>
                  {uk.users.deactivate}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => handleSetActive(true)} className={cn(buttonClassName)}>
            {uk.users.reactivate}
          </Button>
        ))}
    </span>
  )
}
