import { describe, expect, it } from 'vitest'
import { EffectivePermissions } from '@starland/domain'
import { visibleNavItems } from '../src/components/layout/visible-nav-items.js'

describe('visibleNavItems', () => {
  it('hides items whose required permission is missing', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/students')).toBe(false)
  })

  it('shows an item once its required permission is granted', () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const items = visibleNavItems(permissions)
    expect(items.map((i) => i.url)).toContain('/students')
  })

  it('shows items with no permission requirement to everyone', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/')).toBe(true)
  })
})
