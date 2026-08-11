'use client'

import { z } from 'zod'
import { uk } from '@starland/i18n'
import { createEmployee } from '@/app/(app)/staff/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewEmployeeForm } from './new-employee-form'
import type { NewEmployeeData } from './new-employee-content'

export function NewEmployeeView({ data }: { data: NewEmployeeData }) {
  async function submitNewEmployee(
    raw: unknown,
  ): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    try {
      const { id } = await createEmployee(raw)
      return { ok: true, id }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { ok: false, message: err.issues[0]?.message ?? uk.staff.createError }
      }
      return { ok: false, message: uk.staff.createError }
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{uk.staff.addEmployee}</CardTitle>
        <p className="text-sm text-muted-foreground">{uk.staff.addEmployeeHint}</p>
      </CardHeader>
      <CardContent>
        <NewEmployeeForm positions={data.positions} submitAction={submitNewEmployee} />
      </CardContent>
    </Card>
  )
}
