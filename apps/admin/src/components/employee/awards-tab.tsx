'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
type Award = { id: string; title: string; awardedOn: Date }

function formatKyivDate(date: Date): string {
  return date.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'short', year: 'numeric' })
}

export function AwardsTab({
  awards,
  canManage,
  addAwardAction,
  removeAwardAction,
}: {
  awards: Award[]
  canManage: boolean
  addAwardAction: (raw: unknown) => Promise<ActionResult>
  removeAwardAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [awardTitle, setAwardTitle] = useState('')
  const [awardedOn, setAwardedOn] = useState('')

  function handleAddAward() {
    if (!awardTitle.trim() || !awardedOn) return
    startTransition(async () => {
      const result = await addAwardAction({ title: awardTitle, awardedOn })
      if (result.ok) {
        toast.success(uk.users.addAwardSuccess)
        setAwardTitle('')
        setAwardedOn('')
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleRemoveAward(awardId: string) {
    startTransition(async () => {
      const result = await removeAwardAction({ awardId })
      if (result.ok) {
        toast.success(uk.users.removeAwardSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="space-y-3">
      {awards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{uk.users.noAwards}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {awards.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{formatKyivDate(a.awardedOn)}</p>
              </div>
              {canManage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isPending}>
                      {uk.users.removeAward}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{uk.users.removeAwardConfirmTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{uk.users.removeAwardConfirmDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRemoveAward(a.id)}>
                        {uk.users.removeAward}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5">
            <Label>{uk.users.awardTitle}</Label>
            <Input value={awardTitle} onChange={(e) => setAwardTitle(e.target.value)} className="w-64" />
          </div>
          <div className="space-y-1.5">
            <Label>{uk.users.awardedOn}</Label>
            <Input type="date" value={awardedOn} onChange={(e) => setAwardedOn(e.target.value)} />
          </div>
          <Button onClick={handleAddAward} disabled={!awardTitle.trim() || !awardedOn || isPending}>
            {uk.users.addAward}
          </Button>
        </div>
      )}
    </div>
  )
}
