import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'

describe('permissions seed', () => {
  it('creates every school role', async () => {
    const roles = await prisma.role.findMany({ select: { code: true } })
    expect(roles.map((r) => r.code).sort()).toEqual(
      [
        'admin', 'assistant', 'deputy_director', 'developer', 'director',
        'mentor', 'nurse', 'psychologist', 'secretary', 'speech_therapist',
        'student_family', 'teacher',
      ].sort(),
    )
  })

  it('scopes teacher grade permissions to their own teaching assignments', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { code: 'teacher' }, permission: { code: 'grades.write' } },
      select: { scopeKind: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scopeKind).toBe('own_teaching')
  })

  it('never gives a family global access to students', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { code: 'student_family' }, scopeKind: 'global' },
    })
    expect(rows).toHaveLength(0)
  })
})
