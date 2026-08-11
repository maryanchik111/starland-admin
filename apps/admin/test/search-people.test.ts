import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { searchPeopleWithPermissions } from '../src/lib/search-people.js'

describe('searchPeopleWithPermissions', () => {
  it('refuses when the caller has no students.read permission at all', async () => {
    const permissions = new EffectivePermissions([])
    const findMany = vi.fn()
    await expect(
      searchPeopleWithPermissions(permissions, { findMany } as never, 'кова'),
    ).rejects.toThrow(ForbiddenError)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('rejects a query shorter than 2 characters instead of hitting the database', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const findMany = vi.fn()
    await expect(
      searchPeopleWithPermissions(permissions, { findMany } as never, 'к'),
    ).rejects.toThrow(/query/)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('passes a valid query through to the database client', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const findMany = vi.fn().mockResolvedValue([
      { id: 's1', firstName: 'Олена', lastName: 'Коваль' },
    ])
    const result = await searchPeopleWithPermissions(permissions, { findMany } as never, 'ковал')
    expect(findMany).toHaveBeenCalledOnce()
    expect(result).toEqual([{ id: 's1', name: 'Коваль Олена' }])
  })
})
