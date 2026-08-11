'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { CreateStudentInput as CreateStudentSchema } from '@/lib/students/create-student-schema'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

/**
 * The HTML `<input type="date">` this form uses always produces a string,
 * but `CreateStudentInput.bornOn` is `z.coerce.date()`, whose output type is
 * `Date` — cast the resolver rather than relying on `z.input<...>` inference
 * (react-hook-form's `Resolver` type wants input and output to already
 * agree, and `z.coerce.date()`'s input type is `unknown`, not `string`).
 */
type CreateStudentFormValues = {
  firstName: string
  lastName: string
  middleName?: string
  bornOn: string
  livingAddress?: string
  criticalNote?: string
  parentalConsentGivenAt?: string
}
type SubmitResult = { ok: true; id: string } | { ok: false; message: string }
type ActionResult = { ok: true } | { ok: false; message: string }
type AvailableClass = { id: string; name: string }

/**
 * Empty strings mean "field left blank in the UI", not "clear this value" —
 * the optional fields below use `.min(1)`/`.coerce.date()`, which reject an
 * empty string rather than treating it as absent. Same convention as
 * `student-info-section.tsx`'s inline edit form.
 */
const formSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value
  const obj = value as Record<string, unknown>
  return {
    firstName: obj.firstName,
    lastName: obj.lastName,
    middleName: obj.middleName === '' ? undefined : obj.middleName,
    bornOn: obj.bornOn,
    livingAddress: obj.livingAddress === '' ? undefined : obj.livingAddress,
    criticalNote: obj.criticalNote === '' ? undefined : obj.criticalNote,
    parentalConsentGivenAt: obj.parentalConsentGivenAt === '' ? undefined : obj.parentalConsentGivenAt,
  }
}, CreateStudentSchema) as unknown as z.ZodType<CreateStudentFormValues, z.ZodTypeDef, CreateStudentFormValues>

export function CreateStudentForm({
  availableClasses,
  submitAction,
  assignClassAction,
}: {
  availableClasses: AvailableClass[]
  submitAction: (raw: unknown) => Promise<SubmitResult>
  assignClassAction: (studentId: string, classId: string) => Promise<ActionResult>
}) {
  const { close, refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()
  const [classId, setClassId] = useState('')

  const form = useForm<CreateStudentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      middleName: '',
      bornOn: '',
      livingAddress: '',
      criticalNote: '',
      parentalConsentGivenAt: '',
    },
  })

  function onSubmit(values: CreateStudentFormValues): void {
    startTransition(async () => {
      const result = await submitAction(values)
      if (result.ok) {
        toast.success(uk.students.createSuccess)
        if (classId) {
          const assignResult = await assignClassAction(result.id, classId)
          if (!assignResult.ok) toast.error(assignResult.message)
        }
        close()
        refresh()
        return
      }
      form.setError('root', { message: result.message })
      toast.error(result.message)
    })
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
                <Input {...field} />
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
                <Input {...field} />
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
                <Input {...field} value={field.value ?? ''} />
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
                <Input {...field} value={field.value ?? ''} />
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
                <Textarea {...field} value={field.value ?? ''} />
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
        {availableClasses.length > 0 && (
          <div className="space-y-2">
            <Label>{uk.students.class}</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder={uk.students.selectClass} />
              </SelectTrigger>
              <SelectContent>
                {availableClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={isPending}>
            {uk.students.create}
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            {uk.common.cancel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
