import { describe, expect, it } from 'vitest'
import { EffectivePermissions } from '@starland/domain'
import { visibleNavItems } from '../src/components/layout/visible-nav-items.js'

describe('visibleNavItems', () => {
  it('hides an array-gated item when none of its permissions are granted', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/users')).toBe(false)
  })

  it('shows an array-gated item once any one of its permissions is granted', () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const items = visibleNavItems(permissions)
    expect(items.map((i) => i.url)).toContain('/users')
  })

  it('shows items with no permission requirement to everyone', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/')).toBe(true)
  })
})
