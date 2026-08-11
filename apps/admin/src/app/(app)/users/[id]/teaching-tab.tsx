'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ActionResult = { ok: true } | { ok: false; message: string }
type Assignment = { id: string; subjectName: string; className: string; periodName: string }
type Option = { id: string; name: string }

export function TeachingTab({
  assignments,
  subjects,
  classes,
  periods,
  canManage,
  assignAction,
  revokeAction,
}: {
  assignments: Assignment[]
  subjects: Option[]
  classes: Option[]
  periods: Option[]
  canManage: boolean
  assignAction: (raw: unknown) => Promise<ActionResult>
  revokeAction: (raw: unknown) => Promise<ActionResult>
}) {
  const { refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [subjectId, setSubjectId] = useState('')
  const [classId, setClassId] = useState('')
  const [periodId, setPeriodId] = useState('')

  function handleAssign() {
    if (!subjectId || !classId || !periodId) return
    startTransition(async () => {
      const result = await assignAction({ subjectId, classId, periodId })
      if (result.ok) {
        toast.success(uk.users.assignTeachingSuccess)
        setSubjectId('')
        setClassId('')
        setPeriodId('')
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  function handleRevoke(assignmentId: string) {
    startTransition(async () => {
      const result = await revokeAction({ assignmentId })
      if (result.ok) {
        toast.success(uk.users.revokeTeachingSuccess)
        refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="space-y-4">
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{uk.users.noTeachingAssignments}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{uk.users.teachingSubject}</TableHead>
              <TableHead>{uk.users.teachingClass}</TableHead>
              <TableHead>{uk.users.teachingPeriod}</TableHead>
              {canManage && <TableHead className="text-right">{uk.students.actions}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((ta) => (
              <TableRow key={ta.id}>
                <TableCell className="font-medium">{ta.subjectName}</TableCell>
                <TableCell>{ta.className}</TableCell>
                <TableCell className="text-muted-foreground">{ta.periodName}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isPending}>
                          {uk.users.revokeTeaching}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{uk.users.revokeTeachingConfirmTitle}</AlertDialogTitle>
                          <AlertDialogDescription>{uk.users.revokeTeachingConfirmDescription}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{uk.common.cancel}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRevoke(ta.id)}>
                            {uk.users.revokeTeaching}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={uk.users.teachingSubject} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={uk.users.teachingClass} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={uk.users.teachingPeriod} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAssign} disabled={!subjectId || !classId || !periodId || isPending}>
            {uk.users.assignTeaching}
          </Button>
        </div>
      )}
    </div>
  )
}
