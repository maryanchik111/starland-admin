'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { UpdateStudentHealthInput } from '@/lib/students/health-schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

type ActionResult = { ok: true } | { ok: false; message: string }

export type HealthData = {
  healthGroup: string | null
  peGroup: string | null
  allergyCodes: string[]
  chronicCodes: string[]
  activityLimits: string | null
}

/**
 * The HTML inputs this form uses always produce strings — `allergyCodes`/
 * `chronicCodes` are edited as a single comma-separated text field rather
 * than a tag picker (no such primitive exists in components/ui yet, and
 * building one is out of scope for this task), so the form's own value type
 * is all strings; `formSchema` below converts to `UpdateStudentHealthInput`'s
 * shape before validation. Same "empty field = don't touch this column"
 * convention as edit-student-form.tsx.
 */
type HealthFormValues = {
  healthGroup?: string
  peGroup?: string
  allergyCodes?: string
  chronicCodes?: string
  activityLimits?: string
}

function toCodesArray(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const codes = value
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
  return codes.length > 0 ? codes : undefined
}

const healthFormSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value
  const obj = value as Record<string, unknown>
  return {
    healthGroup: obj.healthGroup === '' ? undefined : obj.healthGroup,
    peGroup: obj.peGroup === '' ? undefined : obj.peGroup,
    allergyCodes: toCodesArray(obj.allergyCodes),
    chronicCodes: toCodesArray(obj.chronicCodes),
    activityLimits: obj.activityLimits === '' ? undefined : obj.activityLimits,
  }
}, UpdateStudentHealthInput) as unknown as z.ZodType<HealthFormValues, z.ZodTypeDef, HealthFormValues>

function joinCodes(codes: string[]): string {
  return codes.join(', ')
}

export function HealthSection({
  health,
  canWrite,
  note,
  canReadNote,
  updateHealthAction,
  updateNoteAction,
}: {
  health: HealthData | null
  canWrite: boolean
  note: string | null
  canReadNote: boolean
  updateHealthAction: (raw: unknown) => Promise<ActionResult>
  updateNoteAction: (raw: unknown) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [isHealthPending, startHealthTransition] = useTransition()
  const [isNotePending, startNoteTransition] = useTransition()
  const [noteValue, setNoteValue] = useState(note ?? '')

  const form = useForm<HealthFormValues>({
    resolver: zodResolver(healthFormSchema),
    defaultValues: {
      healthGroup: health?.healthGroup ?? '',
      peGroup: health?.peGroup ?? '',
      allergyCodes: health ? joinCodes(health.allergyCodes) : '',
      chronicCodes: health ? joinCodes(health.chronicCodes) : '',
      activityLimits: health?.activityLimits ?? '',
    },
  })

  function onSubmitHealth(values: HealthFormValues): void {
    startHealthTransition(async () => {
      const result = await updateHealthAction(values)
      if (result.ok) {
        toast.success(uk.students.health.updateSuccess)
        router.refresh()
        return
      }
      form.setError('root', { message: result.message })
      toast.error(result.message)
    })
  }

  function onSubmitNote(): void {
    startNoteTransition(async () => {
      const result = await updateNoteAction({ content: noteValue })
      if (result.ok) {
        toast.success(uk.students.health.noteUpdateSuccess)
        router.refresh()
        return
      }
      toast.error(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {canWrite ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitHealth)} className="flex max-w-md flex-col gap-4">
            <FormField
              control={form.control}
              name="healthGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uk.students.health.healthGroup}</FormLabel>
                  <FormControl>
                    <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="peGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uk.students.health.peGroup}</FormLabel>
                  <FormControl>
                    <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="allergyCodes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uk.students.health.allergyCodes}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={typeof field.value === 'string' ? field.value : ''}
                      placeholder={uk.students.health.codesHint}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="chronicCodes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uk.students.health.chronicCodes}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={typeof field.value === 'string' ? field.value : ''}
                      placeholder={uk.students.health.codesHint}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="activityLimits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uk.students.health.activityLimits}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={typeof field.value === 'string' ? field.value : ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isHealthPending} className="self-start">
              {uk.common.save}
            </Button>
          </form>
        </Form>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {health ? (
            <>
              <dt className="text-muted-foreground">{uk.students.health.healthGroup}</dt>
              <dd>{health.healthGroup ?? '—'}</dd>
              <dt className="text-muted-foreground">{uk.students.health.peGroup}</dt>
              <dd>{health.peGroup ?? '—'}</dd>
              <dt className="text-muted-foreground">{uk.students.health.allergyCodes}</dt>
              <dd>{health.allergyCodes.length ? joinCodes(health.allergyCodes) : '—'}</dd>
              <dt className="text-muted-foreground">{uk.students.health.chronicCodes}</dt>
              <dd>{health.chronicCodes.length ? joinCodes(health.chronicCodes) : '—'}</dd>
              <dt className="text-muted-foreground">{uk.students.health.activityLimits}</dt>
              <dd>{health.activityLimits ?? '—'}</dd>
            </>
          ) : (
            <dd className="col-span-2 text-muted-foreground">{uk.students.health.noHealthData}</dd>
          )}
        </dl>
      )}

      {canReadNote && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">{uk.students.health.note}</h3>
          {canWrite ? (
            <div className="flex max-w-md flex-col gap-2">
              <Textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder={uk.students.health.noteSavePlaceholder}
                rows={4}
              />
              <Button
                type="button"
                size="sm"
                className="self-start"
                disabled={isNotePending}
                onClick={onSubmitNote}
              >
                {uk.common.save}
              </Button>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{note || uk.students.health.noNote}</p>
          )}
        </div>
      )}
    </div>
  )
}
