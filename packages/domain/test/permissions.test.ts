import { describe, expect, it } from 'vitest'
import { EffectivePermissions, ForbiddenError, requirePermission } from '../src/permissions.js'

const scopes = [
  { permissionCode: 'students.read', scopeType: 'class' as const, scopeId: 'class-1' },
  { permissionCode: 'audit.read', scopeType: 'global' as const, scopeId: null },
]

describe('EffectivePermissions', () => {
  it('allows a global permission regardless of scope', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('audit.read')).toBe(true)
    expect(p.can('audit.read', { type: 'class', id: 'class-9' })).toBe(true)
  })

  it('allows a scoped permission only inside its scope', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('students.read', { type: 'class', id: 'class-1' })).toBe(true)
    expect(p.can('students.read', { type: 'class', id: 'class-2' })).toBe(false)
  })

  it('denies a permission that is not present at all', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('students.write', { type: 'class', id: 'class-1' })).toBe(false)
  })

  it('throws ForbiddenError with the permission code in the message', () => {
    const p = new EffectivePermissions(scopes)
    expect(() => requirePermission(p, 'students.write', { type: 'class', id: 'class-1' }))
      .toThrow(ForbiddenError)
    expect(() => requirePermission(p, 'students.write', { type: 'class', id: 'class-1' }))
      .toThrow(/students\.write/)
  })
})
