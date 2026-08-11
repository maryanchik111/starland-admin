'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { UpdateStudentInput as UpdateStudentSchema } from '@/lib/students/update-student-schema'
import { usePersonModal } from '@/components/person-modal-provider'
import { PersonLink } from '@/components/person-link'
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

type SubmitResult = { ok: true } | { ok: false; message: string }

/**
 * Same input shape/preprocessing as the former `EditStudentForm`: the
 * `<input type="date">` always produces a string, but `UpdateStudentInput.bornOn`
 * is `z.coerce.date()`, and empty strings mean "left blank", not "clear this
 * value" — `updateStudentWithPermissions` treats `undefined` as "don't touch
 * this column".
 */
type StudentInfoFormValues = {
  firstName?: string
  lastName?: string
  middleName?: string
  bornOn?: string
  livingAddress?: string
  criticalNote?: string
  parentalConsentGivenAt?: string
}

const formSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value
  const obj = value as Record<string, unknown>
  return {
    firstName: obj.firstName === '' ? undefined : obj.firstName,
    lastName: obj.lastName === '' ? undefined : obj.lastName,
    middleName: obj.middleName === '' ? undefined : obj.middleName,
    bornOn: obj.bornOn === '' ? undefined : obj.bornOn,
    livingAddress: obj.livingAddress === '' ? undefined : obj.livingAddress,
    criticalNote: obj.criticalNote === '' ? undefined : obj.criticalNote,
    parentalConsentGivenAt: obj.parentalConsentGivenAt === '' ? undefined : obj.parentalConsentGivenAt,
  }
}, UpdateStudentSchema) as unknown as z.ZodType<StudentInfoFormValues, z.ZodTypeDef, StudentInfoFormValues>

/**
 * Inline view/edit for a student's own-table fields (CLAUDE.md §6: every
 * screen has a view and an edit mode, switched by permission — not a
 * separate route). Replaces the former `/students/[id]/edit` page; class
 * assignment and enrollment status stay their own always-interactive
 * controls (`ClassAssign`/`ChangeEnrollmentStatus`) next to this section,
 * not folded into the edit toggle.
 */
export function StudentInfoSection({
  firstName,
  lastName,
  middleName,
  bornOn,
  livingAddress,
  criticalNote,
  parentalConsentGivenAt,
  consentEnteredById,
  consentEnteredByName,
  canEdit,
  updateAction,
}: {
  firstName: string
  lastName: string
  middleName: string | null
  bornOn: string
  livingAddress: string | null
  criticalNote: string | null
  parentalConsentGivenAt: string | null
  consentEnteredById: string | null
  consentEnteredByName: string | null
  canEdit: boolean
  updateAction: (raw: unknown) => Promise<SubmitResult>
}) {
  const { refresh } = usePersonModal()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<StudentInfoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName,
      lastName,
      middleName: middleName ?? '',
      bornOn,
      livingAddress: livingAddress ?? '',
      criticalNote: criticalNote ?? '',
      parentalConsentGivenAt: parentalConsentGivenAt ?? '',
    },
  })

  function handleEdit() {
    form.reset({
      firstName,
      lastName,
      middleName: middleName ?? '',
      bornOn,
      livingAddress: livingAddress ?? '',
      criticalNote: criticalNote ?? '',
      parentalConsentGivenAt: parentalConsentGivenAt ?? '',
    })
    setIsEditing(true)
  }

  function onSubmit(values: StudentInfoFormValues): void {
    startTransition(async () => {
      const result = await updateAction(values)
      if (result.ok) {
        toast.success(uk.students.updateSuccess)
        setIsEditing(false)
        refresh()
        return
      }
      form.setError('root', { message: result.message })
      toast.error(result.message)
    })
  }

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{uk.students.lastName}</dt>
          <dd>{lastName}</dd>
          <dt className="text-muted-foreground">{uk.students.firstName}</dt>
          <dd>{firstName}</dd>
          <dt className="text-muted-foreground">{uk.students.middleName}</dt>
          <dd>{middleName ?? '—'}</dd>
          <dt className="text-muted-foreground">{uk.students.bornOn}</dt>
          <dd>{new Date(bornOn).toLocaleDateString('uk-UA')}</dd>
          <dt className="text-muted-foreground">{uk.students.address}</dt>
          <dd>{livingAddress ?? '—'}</dd>
          <dt className="text-muted-foreground">{uk.students.criticalNote}</dt>
          <dd>{criticalNote ?? '—'}</dd>
          <dt className="text-muted-foreground">{uk.students.parentalConsent}</dt>
          <dd>
            {parentalConsentGivenAt ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span>{new Date(parentalConsentGivenAt).toLocaleDateString('uk-UA')}</span>
                {consentEnteredById && (
                  <span className="text-muted-foreground text-xs">
                    ({uk.students.consentEnteredBy}{' '}
                    <PersonLink id={consentEnteredById} name={consentEnteredByName ?? consentEnteredById} kind="user" />)
                  </span>
                )}
              </span>
            ) : (
              uk.students.consentNotGiven
            )}
          </dd>
        </dl>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={handleEdit}>
            {uk.common.edit}
          </Button>
        )}
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4">
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.lastName}</FormLabel>
              <FormControl>
                <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.firstName}</FormLabel>
              <FormControl>
                <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="middleName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.middleName}</FormLabel>
              <FormControl>
                <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bornOn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.bornOn}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="livingAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.address}</FormLabel>
              <FormControl>
                <Input {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="criticalNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.criticalNote}</FormLabel>
              <FormControl>
                <Textarea {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="parentalConsentGivenAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.students.consentGivenOn}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={typeof field.value === 'string' ? field.value : ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={isPending}>
            {uk.common.save}
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isPending}>
            {uk.common.cancel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
