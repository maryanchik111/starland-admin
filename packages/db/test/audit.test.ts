import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { createAuthUser } from './rls-harness.js'

describe('audit log', () => {
  it('records who granted a permission and why', async () => {
    const authId = await createAuthUser(`grantor-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })

    const grant = await prisma.permissionGrant.create({
      data: {
        userId: user.id, permissionId: permission.id, effect: 'allow', scopeType: 'global',
        reason: 'Доступ на час річної перевірки', grantedBy: user.id,
      },
    })

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'permission_grants', entityId: grant.id },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('INSERT')
    expect(logs[0]?.newValues).toMatchObject({ reason: 'Доступ на час річної перевірки' })
  })

  // The brief's original design stored the full row (to_jsonb(old)/to_jsonb(new))
  // for every audited table, including `students`. That would put personal data
  // (address, notes, etc.) into audit_logs, which CLAUDE.md explicitly forbids
  // ("Персональні та медичні дані не логуються ... ні в audit_logs.details").
  // Per human decision, `students` is audited with a redacted trigger instead:
  // it records WHICH fields changed and whether they were present or absent,
  // never the actual values. This test asserts on that redacted shape and
  // guards against the real address ever leaking into old/new values.
  it('records a redacted change shape when a student is edited, never the real values', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Богдан', lastName: 'Хмельницький', bornOn: new Date('2014-01-01') },
    })
    await prisma.student.update({ where: { id: student.id }, data: { livingAddress: 'вул. Нова, 1' } })

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'students', entityId: student.id, action: 'UPDATE' },
    })
    expect(logs).toHaveLength(1)

    const { oldValues, newValues } = logs[0] as { oldValues: Record<string, unknown>; newValues: Record<string, unknown> }

    // living_address was NULL before the update -> presence/absence preserved as null.
    expect(oldValues.living_address).toBeNull()
    // living_address is populated after the update -> redacted marker, not the value.
    expect(newValues.living_address).toBe('[REDACTED]')

    // Regression guard: the literal address must never appear anywhere in storage.
    expect(JSON.stringify(oldValues)).not.toContain('вул. Нова, 1')
    expect(JSON.stringify(newValues)).not.toContain('вул. Нова, 1')
  })

  it('lets a user with global audit.read scope see log rows, and blocks users without it', async () => {
    const { asUser } = await import('./rls-harness.js')

    const authId = await createAuthUser(`auditreader-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })

    const noScopeAuthId = await createAuthUser(`noaudit-${Date.now()}@starland.test`)

    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })
    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id, created_at, updated_at)
      values (${user.id}::uuid, 'audit.read', 'global'::scope_type, null, now(), now())
    `

    const grant = await prisma.permissionGrant.create({
      data: {
        userId: user.id, permissionId: permission.id, effect: 'allow', scopeType: 'global',
        reason: 'Тест видимості аудиту', grantedBy: user.id,
      },
    })

    const visibleWithScope = await asUser(authId, async (c) => {
      return c.$queryRaw<{ id: string }[]>`select id from audit_logs where entity_type = 'permission_grants' and entity_id = ${grant.id}::uuid`
    })
    expect(visibleWithScope.length).toBeGreaterThan(0)

    const visibleWithoutScope = await asUser(noScopeAuthId, async (c) => {
      return c.$queryRaw<{ id: string }[]>`select id from audit_logs where entity_type = 'permission_grants' and entity_id = ${grant.id}::uuid`
    })
    expect(visibleWithoutScope).toHaveLength(0)
  })
})
