import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { updateStudentWithPermissions } from '../src/lib/students/update-student.js'

const student = { id: 'student-1', classId: 'class-1' }

describe('updateStudent', () => {
  it('refuses when the user has no write permission for that class', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, student, { livingAddress: 'вул. Нова, 1' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('rejects an empty address instead of writing it', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, student, { livingAddress: '   ' }),
    ).rejects.toThrow(/livingAddress/)
  })
})
