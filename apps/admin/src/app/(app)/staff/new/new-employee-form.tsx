'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SubmitResult = { ok: true; id: string } | { ok: false; message: string }
type Position = { code: string; name: string }

export function NewEmployeeForm({
  positions,
  submitAction,
}: {
  positions: Position[]
  submitAction: (raw: unknown) => Promise<SubmitResult>
}) {
  const { close, refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [positionCode, setPositionCode] = useState('')
  const [hiredOn, setHiredOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await submitAction({
        firstName,
        lastName,
        phone: phone.trim() || undefined,
        positionCode: positionCode || undefined,
        hiredOn: hiredOn || undefined,
      })
      if (result.ok) {
        toast.success(uk.staff.createSuccess)
        close()
        refresh()
        return
      }
      setError(result.message)
      toast.error(result.message)
    })
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="space-y-1.5">
        <Label>{uk.staff.firstName}</Label>
        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{uk.staff.lastName}</Label>
        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{uk.staff.position}</Label>
        <Select value={positionCode} onValueChange={setPositionCode}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={uk.staff.position} />
          </SelectTrigger>
          <SelectContent>
            {positions.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{uk.staff.phone}</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>{uk.staff.hiredOn}</Label>
        <Input type="date" value={hiredOn} onChange={(e) => setHiredOn(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex gap-3">
        <Button onClick={handleSubmit} disabled={!firstName.trim() || !lastName.trim() || isPending}>
          {uk.staff.create}
        </Button>
        <Button variant="outline" onClick={close}>
          {uk.common.cancel}
        </Button>
      </div>
    </div>
  )
}
