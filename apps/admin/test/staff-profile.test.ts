import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError, NotFoundError } from '@starland/domain'
import { updateStaffProfileWithPermissions } from '../src/lib/staff/update-staff-profile.js'
import { addAwardWithPermissions, removeAwardWithPermissions } from '../src/lib/staff/manage-awards.js'

const createdAppUserIds: string[] = []
const createdEmployeeIds: string[] = []

async function makeUser(email: string): Promise<{ authUserId: string; appUserId: string }> {
  const authUserId = randomUUID()
  const appUser = await prisma.appUser.create({
    data: { authUserId, fullName: email.split('@')[0] ?? email, email },
  })
  createdAppUserIds.push(appUser.id)
  return { authUserId, appUserId: appUser.id }
}

async function makeAccountlessEmployee(): Promise<{ id: string }> {
  const employee = await prisma.employee.create({
    data: { firstName: 'Охорона', lastName: `Тест-${randomUUID().slice(0, 8)}` },
  })
  createdEmployeeIds.push(employee.id)
  return { id: employee.id }
}

const globalStaffWrite = new EffectivePermissions([
  { permissionCode: 'staff.write', scopeType: 'global', scopeId: null },
])

afterEach(async () => {
  while (createdAppUserIds.length > 0) {
    const id = createdAppUserIds.pop()
    if (!id) continue
    const employee = await prisma.employee.findUnique({ where: { userId: id } })
    if (employee) {
      await prisma.staffAward.deleteMany({ where: { employeeId: employee.id } })
      await prisma.employee.deleteMany({ where: { id: employee.id } })
    }
    await prisma.appUser.deleteMany({ where: { id } })
  }
  while (createdEmployeeIds.length > 0) {
    const id = createdEmployeeIds.pop()
    if (!id) continue
    await prisma.staffAward.deleteMany({ where: { employeeId: id } })
    await prisma.employee.deleteMany({ where: { id } })
  }
})

describe('updateStaffProfileWithPermissions', () => {
  it('throws ForbiddenError without staff.write', async () => {
    const target = await makeUser(`staff-no-perm-${randomUUID()}@admin-starland.test`)
    await expect(
      updateStaffProfileWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { userId: target.appUserId }, {
        positionCode: 'teacher',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates an employee (deriving name from the linked app_user) when none exists yet', async () => {
    const target = await makeUser(`staff-create-${randomUUID()}@admin-starland.test`)

    await updateStaffProfileWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      phone: '+380501112233',
      category: 'Вища',
      experienceYears: 5,
      positionCode: 'teacher',
    })

    const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: target.appUserId } })
    expect(employee.phone).toBe('+380501112233')
    expect(employee.category).toBe('Вища')
    expect(employee.experienceYears).toBe(5)
    expect(employee.positionCode).toBe('teacher')
    expect(employee.firstName.length).toBeGreaterThan(0)
    expect(employee.lastName.length).toBeGreaterThan(0)
    expect(employee.employmentStatus).toBe('working')
  })

  it('updates an existing employee', async () => {
    const target = await makeUser(`staff-update-${randomUUID()}@admin-starland.test`)
    await updateStaffProfileWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      positionCode: 'teacher',
    })

    await updateStaffProfileWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      positionCode: 'deputy_director',
      employmentStatus: 'vacation',
    })

    const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: target.appUserId } })
    expect(employee.positionCode).toBe('deputy_director')
    expect(employee.employmentStatus).toBe('vacation')
  })

  it('rejects a negative experienceYears', async () => {
    const target = await makeUser(`staff-negative-${randomUUID()}@admin-starland.test`)
    await expect(
      updateStaffProfileWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
        experienceYears: -1,
      }),
    ).rejects.toThrow()
  })

  it('updates an employee with no login account, targeted by employeeId', async () => {
    const employee = await makeAccountlessEmployee()

    await updateStaffProfileWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { employeeId: employee.id }, {
      positionCode: 'security_guard',
      employmentStatus: 'working',
    })

    const updated = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } })
    expect(updated.positionCode).toBe('security_guard')
    expect(updated.userId).toBeNull()
  })
})

describe('addAwardWithPermissions / removeAwardWithPermissions', () => {
  it('throws ForbiddenError without staff.write', async () => {
    const target = await makeUser(`award-no-perm-${randomUUID()}@admin-starland.test`)
    await expect(
      addAwardWithPermissions(new EffectivePermissions([]), { authUserId: randomUUID() }, { userId: target.appUserId }, {
        title: 'Грамота',
        awardedOn: '2026-01-01',
      }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('creates the employee record on demand when adding the first award', async () => {
    const target = await makeUser(`award-first-${randomUUID()}@admin-starland.test`)
    await addAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      title: 'Грамота за перемогу в олімпіаді',
      awardedOn: '2026-01-01',
    })

    const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: target.appUserId } })
    const awards = await prisma.staffAward.findMany({ where: { employeeId: employee.id, deletedAt: null } })
    expect(awards).toHaveLength(1)
    expect(awards[0]?.title).toBe('Грамота за перемогу в олімпіаді')
  })

  it('throws NotFoundError removing an unknown award', async () => {
    const target = await makeUser(`award-404-${randomUUID()}@admin-starland.test`)
    await expect(
      removeAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
        awardId: randomUUID(),
      }),
    ).rejects.toThrow(NotFoundError)
  })

  it('soft-deletes an award, which then no longer appears in the active list', async () => {
    const target = await makeUser(`award-remove-${randomUUID()}@admin-starland.test`)
    const created = await addAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      title: 'Подяка',
      awardedOn: '2026-01-01',
    })

    await removeAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { userId: target.appUserId }, {
      awardId: created.id,
    })

    const row = await prisma.staffAward.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.deletedAt).not.toBeNull()

    const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: target.appUserId } })
    const activeAwards = await prisma.staffAward.findMany({ where: { employeeId: employee.id, deletedAt: null } })
    expect(activeAwards).toHaveLength(0)
  })

  it('adds and removes an award for an employee with no login account, targeted by employeeId', async () => {
    const employee = await makeAccountlessEmployee()

    const created = await addAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { employeeId: employee.id }, {
      title: 'Подяка',
      awardedOn: '2026-01-01',
    })
    const activeBefore = await prisma.staffAward.findMany({ where: { employeeId: employee.id, deletedAt: null } })
    expect(activeBefore).toHaveLength(1)

    await removeAwardWithPermissions(globalStaffWrite, { authUserId: randomUUID() }, { employeeId: employee.id }, {
      awardId: created.id,
    })
    const activeAfter = await prisma.staffAward.findMany({ where: { employeeId: employee.id, deletedAt: null } })
    expect(activeAfter).toHaveLength(0)
  })
})
