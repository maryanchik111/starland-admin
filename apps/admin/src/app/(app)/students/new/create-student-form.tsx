'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { CreateStudentInput as CreateStudentSchema } from '@/lib/students/create-student-schema'
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
}
type SubmitResult = { ok: true; id: string } | { ok: false; message: string }

export function CreateStudentForm({
  submitAction,
}: {
  submitAction: (raw: unknown) => Promise<SubmitResult>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<CreateStudentFormValues>({
    resolver: zodResolver(CreateStudentSchema as unknown as z.ZodType<CreateStudentFormValues>),
    defaultValues: {
      firstName: '',
      lastName: '',
      middleName: '',
      bornOn: '',
      livingAddress: '',
      criticalNote: '',
    },
  })

  function onSubmit(values: CreateStudentFormValues): void {
    startTransition(async () => {
      const result = await submitAction(values)
      if (result.ok) {
        toast.success(uk.students.createSuccess)
        router.push(`/students/${result.id}`)
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
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={isPending}>
            {uk.students.create}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/students">{uk.common.cancel}</Link>
          </Button>
        </div>
      </form>
    </Form>
  )
}
