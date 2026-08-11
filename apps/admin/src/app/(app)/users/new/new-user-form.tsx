'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { uk } from '@starland/i18n'
import { usePersonModal } from '@/components/person-modal-provider'
import { CreateUserInput as CreateUserSchema } from '@/lib/users/create-user-schema'
import type { CreateUserInput } from '@/lib/users/create-user-schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

type SubmitResult = { ok: true; id: string } | { ok: false; message: string }

export function NewUserForm({
  roles,
  submitAction,
}: {
  roles: { code: string; name: string }[]
  submitAction: (raw: unknown) => Promise<SubmitResult>
}) {
  const { close, refresh } = usePersonModal()
  const [isPending, startTransition] = useTransition()

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { fullName: '', email: '', roleCode: '', temporaryPassword: '' },
  })

  function onSubmit(values: CreateUserInput): void {
    startTransition(async () => {
      const result = await submitAction(values)
      if (result.ok) {
        toast.success(uk.users.createSuccess)
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
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.users.fullName}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.users.email}</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roleCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.users.role}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.code} value={role.code}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="temporaryPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uk.users.temporaryPassword}</FormLabel>
              <FormControl>
                <Input type="text" {...field} />
              </FormControl>
              <FormDescription>{uk.users.temporaryPasswordHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={isPending}>
            {uk.users.create}
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            {uk.common.cancel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
