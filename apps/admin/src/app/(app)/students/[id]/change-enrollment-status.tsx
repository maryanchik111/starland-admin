'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ActionResult = { ok: true } | { ok: false; message: string }
type EnrollmentStatus = 'withdrawn' | 'graduated' | 'expelled' | 'academic_leave'

const STATUSES: EnrollmentStatus[] = ['withdrawn', 'graduated', 'expelled', 'academic_leave']

export function ChangeEnrollmentStatus({
  canManage,
  changeAction,
}: {
  canManage: boolean
  changeAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<EnrollmentStatus | ''>('')
  const [reason, setReason] = useState('')

  if (!canManage) return null

  function handleSubmit() {
    if (!status || reason.trim().length < 10) return
    startTransition(async () => {
      const result = await changeAction({ status, reason })
      if (result.ok) {
        toast.success(uk.students.enrollmentStatusChangeSuccess)
        setStatus('')
        setReason('')
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Select value={status} onValueChange={(v) => setStatus(v as EnrollmentStatus)}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder={uk.students.enrollmentStatusChange} />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {uk.students.enrollmentStatuses[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{uk.students.enrollmentStatusReason}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm" />
          <Button
            size="sm"
            className="w-fit"
            onClick={handleSubmit}
            disabled={reason.trim().length < 10 || isPending}
          >
            {uk.students.enrollmentStatusChange}
          </Button>
        </div>
      )}
    </div>
  )
}
