import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { createEmployeeWithPermissions } from '../src/lib/staff/create-employee.js'

const createdEmployeeIds: string[] = []

const globalStaffWrite = new EffectivePermissions([
  { permissionCode: 'staff.write', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdEmployeeIds.length > 0) {
    const id = createdEmployeeIds.pop()
    if (!id) continue
    await prisma.staffAward.deleteMany({ where: { employeeId: id } })
    await prisma.employee.deleteMany({ where: { id } })
  }
})

describe('createEmployeeWithPermissions', () => {
  it('throws ForbiddenError without staff.write', async () => {
    await expect(
      createEmployeeWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, {
        firstName: 'Охорона',
        lastName: 'Тест',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates an employee with no userId at all — no system login required', async () => {
    const created = await createEmployeeWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, {
      firstName: 'Охорона',
      lastName: `Тест-${randomUUID().slice(0, 8)}`,
      phone: '+380671112233',
      positionCode: 'security_guard',
      hiredOn: '2026-08-01',
    })
    createdEmployeeIds.push(created.id)

    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } })
    expect(employee.userId).toBeNull()
    expect(employee.phone).toBe('+380671112233')
    expect(employee.positionCode).toBe('security_guard')
    expect(employee.employmentStatus).toBe('working')
    expect(employee.hiredOn?.toISOString().slice(0, 10)).toBe('2026-08-01')
  })

  it('rejects an empty firstName', async () => {
    await expect(
      createEmployeeWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, {
        firstName: '',
        lastName: 'Тест',
      }),
    ).rejects.toThrow()
  })

  it('rejects a negative experienceYears', async () => {
    await expect(
      createEmployeeWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, {
        firstName: 'Охорона',
        lastName: 'Тест',
        experienceYears: -1,
      }),
    ).rejects.toThrow()
  })
})
