import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

describe('teacher scope', () => {
  it('shows a teacher only students from their own class', async () => {
    const authId = await createAuthUser(`teacher-${Date.now()}@starland.test`)
    const teacher = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'teacher' } })

    const year = await prisma.academicYear.create({
      data: { name: `Y-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    const period = await prisma.academicPeriod.create({
      data: { academicYearId: year.id, name: 'I семестр', ordinal: 1,
              startsOn: new Date('2026-09-01'), endsOn: new Date('2026-12-28') },
    })
    const mine = await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 6, name: '6-А' } })
    const other = await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 6, name: '6-Б' } })
    const subject = await prisma.subject.create({ data: { code: `math-${Date.now()}`, name: 'Математика' } })

    const inMyClass = await prisma.student.create({
      data: { firstName: 'Мій', lastName: 'Учень', bornOn: new Date('2014-01-01') },
    })
    const elsewhere = await prisma.student.create({
      data: { firstName: 'Чужий', lastName: 'Учень', bornOn: new Date('2014-01-01') },
    })
    await prisma.enrollment.create({
      data: { studentId: inMyClass.id, classId: mine.id, fromDate: new Date('2026-09-01') },
    })
    await prisma.enrollment.create({
      data: { studentId: elsewhere.id, classId: other.id, fromDate: new Date('2026-09-01') },
    })

    // Спершу призначення, потім роль — щоб перевірити, що тригер бачить обидва джерела.
    await prisma.teachingAssignment.create({
      data: { teacherUserId: teacher.id, subjectId: subject.id, classId: mine.id, periodId: period.id },
    })
    await prisma.userRole.create({ data: { userId: teacher.id, roleId: role.id } })

    const visible = await asUser(authId, async (c) => {
      return c.$queryRaw<Array<{ last_name: string; first_name: string }>>`
        select first_name, last_name from students
      `
    })

    expect(visible.map((s) => s.first_name)).toContain('Мій')
    expect(visible.map((s) => s.first_name)).not.toContain('Чужий')
  })
})
