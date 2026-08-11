'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ActionResult = { ok: true } | { ok: false; message: string }

export function GeneralTab({
  id,
  fullName,
  email,
  registeredOn,
  canManage,
  updateAction,
}: {
  id: string
  fullName: string
  email: string
  registeredOn: string
  canManage: boolean
  updateAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(fullName)

  function handleSave() {
    if (!value.trim()) return
    startTransition(async () => {
      const result = await updateAction({ fullName: value })
      if (result.ok) {
        toast.success(uk.users.updateSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleCancel() {
    setValue(fullName)
  }

  return (
    <div className="border border-border">
      <div className="flex flex-col space-y-1 p-6 border-b border-border">
        <h3 className="font-semibold leading-none tracking-tight">{uk.users.personalData}</h3>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{uk.users.fullName}</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              readOnly={!canManage}
              className="rounded-none shadow-none"
            />
          </div>
          <div className="space-y-2">
            <Label>{uk.users.email}</Label>
            <Input value={email} readOnly className="rounded-none shadow-none" />
          </div>
          <div className="space-y-2">
            <Label>{uk.users.registeredOn}</Label>
            <Input value={registeredOn} readOnly className="rounded-none shadow-none" />
          </div>
          <div className="space-y-2">
            <Label>{uk.users.userId}</Label>
            <Input value={id} readOnly className="rounded-none shadow-none font-mono text-xs" />
          </div>
        </div>

        {canManage && (
          <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-border">
            <Button variant="outline" onClick={handleCancel} disabled={isPending} className="rounded-none shadow-none">
              {uk.common.cancel}
            </Button>
            <Button onClick={handleSave} disabled={!value.trim() || isPending} className="rounded-none shadow-none">
              {uk.common.save}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
