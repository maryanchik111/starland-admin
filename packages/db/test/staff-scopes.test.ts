import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

describe('staff_profiles_read', () => {
  it('lets a user with global staff.read scope see all profiles', async () => {
    const admin = await makeUserWithRole(`staffread-${Date.now()}@starland.test`, 'director')
    const owner = await createAuthUser(`profileowner-${Date.now()}@starland.test`)
    const ownerUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: owner } })
    await prisma.staffProfile.create({ data: { userId: ownerUser.id, position: 'Вчитель' } })

    const visible = await asUser(admin.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from staff_profiles`
    })
    expect(visible.length).toBeGreaterThan(0)
  })

  it('hides profiles from a user with no relevant scope', async () => {
    const secretary = await makeUserWithRole(`nostaffread-${Date.now()}@starland.test`, 'secretary')
    const owner = await createAuthUser(`profileowner2-${Date.now()}@starland.test`)
    const ownerUser = await prisma.appUser.findFirstOrThrow({ where: { authUserId: owner } })
    await prisma.staffProfile.create({ data: { userId: ownerUser.id, position: 'Вчитель' } })

    const visible = await asUser(secretary.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from staff_profiles`
    })
    expect(visible).toHaveLength(0)
  })

  it('lets a user see their own profile row even without staff.read', async () => {
    const authId = await createAuthUser(`ownprofile-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    await prisma.staffProfile.create({ data: { userId: user.id, position: 'Вчитель' } })

    const visible = await asUser(authId, async (c) => {
      return c.$queryRaw<Array<{ id: string; user_id: string }>>`select id, user_id from staff_profiles`
    })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.user_id).toBe(user.id)
  })
})

describe('staff_awards_read', () => {
  async function makeProfileWithAward() {
    const authId = await createAuthUser(`awardowner-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const profile = await prisma.staffProfile.create({ data: { userId: user.id, position: 'Вчитель' } })
    await prisma.staffAward.create({
      data: { profileId: profile.id, title: 'Грамота', awardedOn: new Date('2026-01-01') },
    })
    return { authId, userId: user.id }
  }

  it('lets a user with global staff.read scope see all awards', async () => {
    const { userId: _owner } = await makeProfileWithAward()
    const admin = await makeUserWithRole(`awardread-${Date.now()}@starland.test`, 'director')

    const visible = await asUser(admin.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from staff_awards`
    })
    expect(visible.length).toBeGreaterThan(0)
  })

  it('hides awards from a user with no relevant scope', async () => {
    await makeProfileWithAward()
    const secretary = await makeUserWithRole(`noawardread-${Date.now()}@starland.test`, 'secretary')

    const visible = await asUser(secretary.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from staff_awards`
    })
    expect(visible).toHaveLength(0)
  })
})

describe('teaching_assignments_read', () => {
  async function makeAssignment() {
    const authId = await createAuthUser(`teacherassign-${Date.now()}@starland.test`)
    const teacher = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const year = await prisma.academicYear.create({
      data: { name: `TA-Y-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    const period = await prisma.academicPeriod.create({
      data: { academicYearId: year.id, name: 'I семестр', ordinal: 1,
              startsOn: new Date('2026-09-01'), endsOn: new Date('2026-12-28') },
    })
    const klass = await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: `5-${Date.now()}` } })
    const subject = await prisma.subject.create({ data: { code: `ta-subj-${Date.now()}`, name: 'Історія' } })
    await prisma.teachingAssignment.create({
      data: { teacherUserId: teacher.id, subjectId: subject.id, classId: klass.id, periodId: period.id },
    })
    return { authId, teacherUserId: teacher.id }
  }

  it('lets a user with global staff.read scope see all assignments', async () => {
    await makeAssignment()
    const admin = await makeUserWithRole(`taread-${Date.now()}@starland.test`, 'director')

    const visible = await asUser(admin.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from teaching_assignments`
    })
    expect(visible.length).toBeGreaterThan(0)
  })

  it('hides assignments from a user with no relevant scope', async () => {
    await makeAssignment()
    const secretary = await makeUserWithRole(`notaread-${Date.now()}@starland.test`, 'secretary')

    const visible = await asUser(secretary.authId, async (c) => {
      return c.$queryRaw<Array<{ id: string }>>`select id from teaching_assignments`
    })
    expect(visible).toHaveLength(0)
  })

  it('lets a teacher see their own assignment rows even without staff.read', async () => {
    const { authId, teacherUserId } = await makeAssignment()

    const visible = await asUser(authId, async (c) => {
      return c.$queryRaw<Array<{ id: string; teacher_user_id: string }>>`select id, teacher_user_id from teaching_assignments`
    })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.teacher_user_id).toBe(teacherUserId)
  })
})
