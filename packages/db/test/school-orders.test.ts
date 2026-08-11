import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

describe('school_orders', () => {
  it('is created with a number, kind and issuing date', async () => {
    const director = await makeUserWithRole(`order-creator-${randomUUID()}@starland.test`, 'director')
    const order = await prisma.schoolOrder.create({
      data: {
        number: `${Math.floor(Math.random() * 1000)}-к`,
        issuedOn: new Date('2026-08-15'),
        kind: 'dismissal',
        title: 'Про звільнення охоронця',
        createdBy: director.userId,
      },
    })
    expect(order.deletedAt).toBeNull()
  })

  it('soft-deletes instead of a physical delete', async () => {
    const director = await makeUserWithRole(`order-softdel-${randomUUID()}@starland.test`, 'director')
    const order = await prisma.schoolOrder.create({
      data: {
        number: `${Math.floor(Math.random() * 1000)}-к`,
        issuedOn: new Date('2026-08-15'),
        kind: 'award',
        title: 'Про нагородження',
        createdBy: director.userId,
      },
    })
    const updated = await prisma.schoolOrder.update({ where: { id: order.id }, data: { deletedAt: new Date() } })
    expect(updated.deletedAt).not.toBeNull()

    const stillThere = await prisma.schoolOrder.findUnique({ where: { id: order.id } })
    expect(stillThere).not.toBeNull()
  })
})

describe('RLS: school_orders_read', () => {
  async function makeOrder() {
    const creator = await makeUserWithRole(`order-owner-${randomUUID()}@starland.test`, 'director')
    const order = await prisma.schoolOrder.create({
      data: {
        number: `${Math.floor(Math.random() * 1000)}-к`,
        issuedOn: new Date('2026-08-15'),
        kind: 'enrollment',
        title: 'Про зарахування',
        createdBy: creator.userId,
      },
    })
    return order
  }

  it('lets a user with staff.read or students.read global scope see orders', async () => {
    const order = await makeOrder()
    const secretary = await makeUserWithRole(`order-read-${randomUUID()}@starland.test`, 'secretary')

    const visible = await asUser(secretary.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from school_orders where id = ${order.id}::uuid`
    })
    expect(visible).toHaveLength(1)
  })

  it('hides orders from a role with neither scope', async () => {
    const order = await makeOrder()
    const family = await makeUserWithRole(`order-noread-${randomUUID()}@starland.test`, 'student_family')

    const visible = await asUser(family.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from school_orders where id = ${order.id}::uuid`
    })
    expect(visible).toHaveLength(0)
  })
})
