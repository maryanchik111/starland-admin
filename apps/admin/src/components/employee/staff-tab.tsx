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

type ActionResult = { ok: true } | { ok: false; message: string }
type EmploymentStatus = 'working' | 'vacation' | 'sick_leave' | 'maternity_leave' | 'unpaid_leave' | 'dismissed'
type StaffProfile = {
  phone: string | null
  category: string | null
  experienceYears: number | null
  positionCode: string | null
  employmentStatus: EmploymentStatus
}
type Position = { code: string; name: string }

const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  'working',
  'vacation',
  'sick_leave',
  'maternity_leave',
  'unpaid_leave',
  'dismissed',
]

export function StaffTab({
  profile,
  positions,
  canManage,
  saveProfileAction,
}: {
  profile: StaffProfile
  positions: Position[]
  canManage: boolean
  saveProfileAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [category, setCategory] = useState(profile.category ?? '')
  const [experienceYears, setExperienceYears] = useState(profile.experienceYears?.toString() ?? '')
  const [positionCode, setPositionCode] = useState(profile.positionCode ?? '')
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>(profile.employmentStatus)

  function handleSaveProfile() {
    startTransition(async () => {
      const result = await saveProfileAction({
        phone: phone.trim() || undefined,
        category: category.trim() || undefined,
        experienceYears: experienceYears.trim() ? Number(experienceYears) : undefined,
        positionCode: positionCode || undefined,
        employmentStatus,
      })
      if (result.ok) {
        toast.success(uk.users.staffProfileSaveSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
        <div className="space-y-1.5">
          <Label>{uk.users.position}</Label>
          <Select value={positionCode} onValueChange={setPositionCode} disabled={!canManage}>
            <SelectTrigger>
              <SelectValue placeholder={uk.users.position} />
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
          <Label>{uk.users.employmentStatus}</Label>
          <Select value={employmentStatus} onValueChange={(v) => setEmploymentStatus(v as EmploymentStatus)} disabled={!canManage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {uk.users.employmentStatuses[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{uk.users.phone}</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label>{uk.users.category}</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label>{uk.users.experienceYears}</Label>
          <Input
            type="number"
            min={0}
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            disabled={!canManage}
          />
        </div>
      </div>
      {canManage && (
        <Button onClick={handleSaveProfile} disabled={isPending}>
          {uk.common.save}
        </Button>
      )}
    </div>
  )
}
