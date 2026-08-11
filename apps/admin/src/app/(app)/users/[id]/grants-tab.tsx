'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
type Grant = {
  id: string
  permissionCode: string
  permissionDescription: string
  reason: string
  expiresAt: Date | null
  createdAt: Date
}
type PermissionOption = { code: string; description: string }

function formatKyivDate(date: Date): string {
  return date.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'short', year: 'numeric' })
}

export function GrantsTab({
  grants,
  permissions,
  canManage,
  grantAction,
  revokeAction,
}: {
  grants: Grant[]
  permissions: PermissionOption[]
  canManage: boolean
  grantAction: (raw: unknown) => Promise<ActionResult>
  revokeAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [permissionCode, setPermissionCode] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  function handleGrant() {
    if (!permissionCode || reason.trim().length < 10) return
    startTransition(async () => {
      const result = await grantAction({
        permissionCode,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      })
      if (result.ok) {
        toast.success(uk.users.grantPermissionSuccess)
        setPermissionCode('')
        setReason('')
        setExpiresAt('')
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleRevoke(grantId: string) {
    startTransition(async () => {
      const result = await revokeAction({ grantId })
      if (result.ok) {
        toast.success(uk.users.revokePermissionGrantSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{uk.users.permissionGrants}</h3>

      {grants.length === 0 ? (
        <p className="text-muted-foreground text-sm">{uk.users.noPermissionGrants}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grants.map((g) => (
            <li key={g.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-1">
                <Badge variant="outline" className="w-fit border-indigo-200 text-indigo-700 bg-indigo-50">
                  {g.permissionDescription}
                </Badge>
                <p className="text-sm text-muted-foreground">{g.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {formatKyivDate(g.createdAt)}
                  {g.expiresAt ? ` · до ${formatKyivDate(g.expiresAt)}` : ''}
                </p>
              </div>
              {canManage && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isPending}>
                      {uk.users.revokePermissionGrant}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{uk.users.revokePermissionGrantConfirmTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{uk.users.revokePermissionGrantConfirmDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRevoke(g.id)}>
                        {uk.users.revokePermissionGrant}
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
        <div className="flex flex-col gap-3 pt-2 max-w-md">
          <Select value={permissionCode} onValueChange={setPermissionCode}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={uk.users.permission} />
            </SelectTrigger>
            <SelectContent>
              {permissions.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1.5">
            <Label>{uk.users.grantReason}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={uk.users.grantReasonPlaceholder}
            />
            <p className="text-xs text-muted-foreground">{uk.users.grantReasonHint}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{uk.users.grantExpiresAt}</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <Button
            onClick={handleGrant}
            disabled={!permissionCode || reason.trim().length < 10 || isPending}
            className="w-fit"
          >
            {uk.users.grantPermission}
          </Button>
        </div>
      )}
    </div>
  )
}
