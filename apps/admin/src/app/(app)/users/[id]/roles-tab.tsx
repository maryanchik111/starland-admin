'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { Badge } from '@/components/ui/badge'
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
type ActiveRole = { id: string; roleCode: string; roleName: string }

export function RolesTab({
  activeRoles,
  allRoles,
  canManage,
  assignAction,
  revokeAction,
}: {
  activeRoles: ActiveRole[]
  allRoles: { code: string; name: string }[]
  canManage: boolean
  assignAction: (raw: unknown) => Promise<ActionResult>
  revokeAction: (raw: unknown) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedRole, setSelectedRole] = useState('')

  const assignableRoles = allRoles.filter((r) => !activeRoles.some((ar) => ar.roleCode === r.code))

  function handleAssign() {
    if (!selectedRole) return
    startTransition(async () => {
      const result = await assignAction({ roleCode: selectedRole })
      if (result.ok) {
        toast.success(uk.users.assignSuccess)
        setSelectedRole('')
        router.refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleRevoke(roleCode: string) {
    startTransition(async () => {
      const result = await revokeAction({ roleCode })
      if (result.ok) {
        toast.success(uk.users.revokeSuccess)
        router.refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="space-y-4">
      <ul className="flex flex-col gap-2">
        {activeRoles.length === 0 && <li className="text-muted-foreground text-sm">{uk.users.noRoles}</li>}
        {activeRoles.map((ar) => (
          <li key={ar.id} className="flex items-center justify-between gap-3">
            <Badge variant="secondary">{ar.roleName}</Badge>
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isPending}>
                    {uk.users.revoke}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{uk.users.revokeConfirmTitle}</AlertDialogTitle>
                    <AlertDialogDescription>{uk.users.revokeConfirmDescription}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleRevoke(ar.roleCode)}>
                      {uk.users.revoke}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </li>
        ))}
      </ul>

      {canManage && assignableRoles.length > 0 && (
        <div className="flex items-end gap-3">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={uk.users.role} />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role.code} value={role.code}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAssign} disabled={!selectedRole || isPending}>
            {uk.users.assignRole}
          </Button>
        </div>
      )}
    </div>
  )
}
