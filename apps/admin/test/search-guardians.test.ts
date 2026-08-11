import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { searchGuardiansWithPermissions } from '../src/lib/students/search-guardians.js'

describe('searchGuardiansWithPermissions', () => {
  it('refuses when the caller has no students.write on the given class', async () => {
    const permissions = new EffectivePermissions([])
    const findMany = vi.fn()
    await expect(
      searchGuardiansWithPermissions(permissions, { findMany } as never, randomUUID(), 'петр'),
    ).rejects.toThrow(ForbiddenError)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('rejects a query shorter than 2 characters instead of hitting the database', async () => {
    const classId = randomUUID()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: classId },
    ])
    const findMany = vi.fn()
    await expect(
      searchGuardiansWithPermissions(permissions, { findMany } as never, classId, 'п'),
    ).rejects.toThrow(/query/)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('passes a valid query through, filters out soft-deleted people, and maps the result', async () => {
    const classId = randomUUID()
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: classId },
    ])
    const findMany = vi.fn().mockResolvedValue([
      { id: 'p1', firstName: 'Наталя', lastName: 'Петренко', phone: '+380501234567' },
    ])
    const result = await searchGuardiansWithPermissions(permissions, { findMany } as never, classId, 'петр')

    expect(findMany).toHaveBeenCalledOnce()
    const callArgs = findMany.mock.calls[0]?.[0]
    expect(callArgs.where.deletedAt).toBeNull()
    expect(result).toEqual([{ id: 'p1', name: 'Петренко Наталя', phone: '+380501234567' }])
  })
})
