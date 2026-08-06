'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { UpdateStudentInput as UpdateStudentSchema } from '@/lib/students/update-student'
import type { UpdateStudentInput } from '@/lib/students/update-student'
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

type EditStudentFormValues = UpdateStudentInput

type SubmitResult = { ok: true } | { ok: false; message: string }

/**
 * Empty strings mean "field left blank in the UI", not "clear this value" —
 * `updateStudentWithPermissions` treats `undefined` as "don't touch this
 * column" (see apps/admin/src/lib/students/update-student.ts), so an empty
 * `livingAddress` must become `undefined` before it reaches
 * `UpdateStudentInput`, which requires a non-empty string when the key is
 * present at all. This preprocesses input shape only — the validation rules
 * themselves stay solely in `UpdateStudentInput`, imported and reused as-is.
 */
const formSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value
  const obj = value as Record<string, unknown>
  return {
    livingAddress: obj.livingAddress === '' ? undefined : obj.livingAddress,
    criticalNote: obj.criticalNote === '' ? undefined : obj.criticalNote,
  }
}, UpdateStudentSchema) as unknown as z.ZodType<EditStudentFormValues, z.ZodTypeDef, EditStudentFormValues>

export function EditStudentForm({
  studentId,
  defaultValues,
  submitAction,
}: {
  studentId: string
  defaultValues: EditStudentFormValues
  submitAction: (raw: unknown) => Promise<SubmitResult>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<EditStudentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      livingAddress: defaultValues.livingAddress ?? '',
      criticalNote: defaultValues.criticalNote ?? '',
    },
  })

  function onSubmit(values: EditStudentFormValues): void {
    startTransition(async () => {
      const result = await submitAction(values)
      if (result.ok) {
        toast.success(uk.students.updateSuccess)
        router.push(`/students/${studentId}`)
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
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={isPending}>
            {uk.common.save}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/students/${studentId}`}>{uk.common.cancel}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
