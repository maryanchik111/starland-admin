import { describe, expect, it } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { updateStudentWithPermissions } from '../src/lib/students/update-student.js'

const student = { id: 'student-1', classId: 'class-1' }
// Never reached in these two tests: both fail before any database write (the
// first on the permission check, the second on Zod validation).
const actor = { authUserId: '00000000-0000-0000-0000-000000000001' }

describe('updateStudent', () => {
  it('refuses when the user has no write permission for that class', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, actor, student, { livingAddress: 'вул. Нова, 1' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('rejects an empty address instead of writing it', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, actor, student, { livingAddress: '   ' }),
    ).rejects.toThrow(/livingAddress/)
  })
})
