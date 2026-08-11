import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@starland/db'
import { EffectivePermissions, ForbiddenError } from '@starland/domain'
import { getPersonActivityLogWithPermissions } from '../src/lib/audit/get-person-activity-log.js'

const createdStudentIds: string[] = []

afterEach(async () => {
  while (createdStudentIds.length > 0) {
    const id = createdStudentIds.pop()
    if (!id) continue
    await prisma.auditLog.deleteMany({ where: { entityType: 'students', entityId: id } })
    await prisma.student.deleteMany({ where: { id } })
  }
})

describe('getPersonActivityLogWithPermissions', () => {
  it('throws ForbiddenError without audit.read', async () => {
    await expect(
      getPersonActivityLogWithPermissions(new EffectivePermissions([]), prisma, [
        { entityType: 'students', entityId: randomUUID() },
      ]),
    ).rejects.toThrow(ForbiddenError)
  })

  it('returns an empty list without querying when there are no targets', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'audit.read', scopeType: 'global', scopeId: null },
    ])
    await expect(getPersonActivityLogWithPermissions(permissions, prisma, [])).resolves.toEqual([])
  })

  it('aggregates rows across entity types, newest first, with redacted values reduced to changed field names', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'audit.read', scopeType: 'global', scopeId: null },
    ])

    const student = await prisma.student.create({
      data: { firstName: 'Тест', lastName: 'Активність', bornOn: new Date('2015-01-01') },
    })
    createdStudentIds.push(student.id)
    await prisma.student.update({ where: { id: student.id }, data: { livingAddress: 'вул. Нова, 1' } })

    const rows = await getPersonActivityLogWithPermissions(permissions, prisma, [
      { entityType: 'students', entityId: student.id },
    ])

    expect(rows).toHaveLength(2)
    // newest first
    expect(rows[0]?.action).toBe('UPDATE')
    expect(rows[1]?.action).toBe('INSERT')
    // redacted table -> field names only, never the real address
    expect(rows[0]?.changedFields).toContain('living_address')
    expect(JSON.stringify(rows)).not.toContain('вул. Нова, 1')
  })
})
